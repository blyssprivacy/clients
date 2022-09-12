from rust:latest as builder

WORKDIR /spiral
COPY ./spiral-rs .
RUN cargo install --bin preprocess_db --path .


from python:3.10

WORKDIR /spiral/bin
COPY --from=builder /usr/local/cargo/bin/preprocess_db /spiral/bin/preprocess_db
COPY ./params_store.json ../
COPY ./setup/balances/dbupdater.py .
RUN yes | pip3 install boto3 requests


CMD ["python3", "-u", "dbupdater.py", "/spiral-databases"]