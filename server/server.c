/*
 * TCP Chat Server — server.c
 *
 * Multi-client chat server built on raw POSIX TCP sockets.
 * Each connection gets its own thread; a mutex protects the client registry.
 * Messages are broadcast to every connected client except the sender.
 *
 * This is the networking core of the application. Browser clients reach it
 * through the Python WebSocket gateway (see ../gateway/).
 *
 * Usage: ./server [port]   (default: 8080)
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#define DEFAULT_PORT  8080
#define MAX_CLIENTS   64
#define BUFFER_SIZE   1024
#define NAME_LEN      32

typedef struct {
    int                fd;
    char               name[NAME_LEN];
    struct sockaddr_in addr;
} Client;

static Client         *clients[MAX_CLIENTS];
static int             client_count = 0;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

static void registry_add(Client *c)
{
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (!clients[i]) { clients[i] = c; client_count++; return; }
    }
}

static void registry_remove(int fd)
{
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (clients[i] && clients[i]->fd == fd) {
            clients[i] = NULL; client_count--; return;
        }
    }
}

static void broadcast(const char *msg, int sender_fd)
{
    pthread_mutex_lock(&lock);
    for (int i = 0; i < MAX_CLIENTS; i++)
        if (clients[i] && clients[i]->fd != sender_fd)
            send(clients[i]->fd, msg, strlen(msg), MSG_NOSIGNAL);
    pthread_mutex_unlock(&lock);
}

static void *handle_client(void *arg)
{
    Client *c = (Client *)arg;
    char    buf[BUFFER_SIZE], msg[BUFFER_SIZE + NAME_LEN + 8];
    int     n;

    /* First recv: display name */
    n = recv(c->fd, c->name, NAME_LEN - 1, 0);
    if (n <= 0) goto cleanup;
    c->name[n] = '\0';
    c->name[strcspn(c->name, "\r\n")] = '\0';

    printf("[+] '%s' from %s\n", c->name, inet_ntoa(c->addr.sin_addr));
    snprintf(msg, sizeof(msg), "*** %s joined ***\n", c->name);
    broadcast(msg, c->fd);

    while ((n = recv(c->fd, buf, BUFFER_SIZE - 1, 0)) > 0) {
        buf[n] = '\0';
        buf[strcspn(buf, "\r\n")] = '\0';
        if (!strlen(buf)) continue;
        printf("[%s] %s\n", c->name, buf);
        snprintf(msg, sizeof(msg), "[%s] %s\n", c->name, buf);
        broadcast(msg, c->fd);
    }

cleanup:
    printf("[-] '%s' left\n", c->name);
    snprintf(msg, sizeof(msg), "*** %s left ***\n", c->name);
    broadcast(msg, c->fd);
    pthread_mutex_lock(&lock);
    registry_remove(c->fd);
    pthread_mutex_unlock(&lock);
    close(c->fd);
    free(c);
    return NULL;
}

int main(int argc, char *argv[])
{
    int port = (argc == 2) ? atoi(argv[1]) : DEFAULT_PORT;
    signal(SIGPIPE, SIG_IGN);

    int sfd = socket(AF_INET, SOCK_STREAM, 0);
    if (sfd < 0) { perror("socket"); return 1; }

    int opt = 1;
    setsockopt(sfd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(port)
    };
    if (bind(sfd, (struct sockaddr *)&addr, sizeof(addr)) < 0) { perror("bind"); return 1; }
    if (listen(sfd, 10) < 0) { perror("listen"); return 1; }

    printf("Chat server on port %d (max %d clients)\n", port, MAX_CLIENTS);

    while (1) {
        struct sockaddr_in caddr;
        socklen_t clen = sizeof(caddr);
        int cfd = accept(sfd, (struct sockaddr *)&caddr, &clen);
        if (cfd < 0) { perror("accept"); continue; }

        pthread_mutex_lock(&lock);
        int full = (client_count >= MAX_CLIENTS);
        pthread_mutex_unlock(&lock);
        if (full) {
            const char *m = "Server full.\n";
            send(cfd, m, strlen(m), 0);
            close(cfd);
            continue;
        }

        Client *client = calloc(1, sizeof(Client));
        if (!client) { close(cfd); continue; }
        client->fd = cfd;
        client->addr = caddr;

        pthread_mutex_lock(&lock);
        registry_add(client);
        pthread_mutex_unlock(&lock);

        pthread_t tid;
        pthread_create(&tid, NULL, handle_client, client);
        pthread_detach(tid);
    }
    close(sfd);
    return 0;
}
