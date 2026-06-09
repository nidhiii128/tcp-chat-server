FROM gcc:12-bookworm
WORKDIR /app
COPY server.c Makefile ./
RUN make
EXPOSE 8080
CMD ["./server", "8080"]
