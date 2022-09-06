from rust:latest as builder

WORKDIR /spiral/src
COPY ./spiral-rs .
RUN cargo install --bin server --features server --path .

COPY ./params_store.json ..
EXPOSE 8089
EXPOSE 9089

CMD ["server", "/spiral-databases/btc-balances.dbp", "8089", "14", "65536"]
