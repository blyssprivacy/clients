from typing import Optional
import os
import sys
import json
import tempfile
import time
from datetime import datetime
import subprocess
import requests
import boto3


BTC_DB_BUCKET = "spiral-databases"
BTC_DB_NAME = "btc-balances"
BTC_BLOCK_TIMESTAMPS = "block-timestamps.json"
BLOCK_EPOCH_OFFSET = 753388


def get_s3_meta(client) -> Optional[str]:
    try:
        response = client.get_object_attributes(
            Bucket=BTC_DB_BUCKET, Key=BTC_DB_NAME + ".meta", ObjectAttributes=["ETag"]
        )
    except:
        return None
    return response.get("ETag", None)


def meta_to_json(local_dir) -> bool:
    basename = os.path.join(local_dir, BTC_DB_NAME)
    try:
        with open(basename + '.meta', "r") as f:
            blockheight, utcstamp = f.readline().split(', ')
    except Exception as e:
        print(e)
        blockheight, utcstamp = ('-1', 'Sat Jan  1 09:41:00 AM UTC 2022')

    try:
        api_quote = requests.get("https://api.coinbase.com/v2/prices/BTC-USD/spot").json()
        btc_price = api_quote['data']['amount']
    except Exception as e:
        print(e)
        btc_price = '0'

    meta_json = {
        'height': blockheight,
        'lastupdate': utcstamp,
        'price': btc_price
    }
    try:
        with open(basename + '.json', "w") as f:
            json.dump(meta_json, f)
    except Exception as e:
        print(e)
        return False

    return True


def pull_latest_db(client, local_dir) -> bool:
    BTC_DB_LOCAL = os.path.join(local_dir, BTC_DB_NAME)
    try:
        with open(BTC_DB_LOCAL + ".db", "wb") as f:
            client.download_fileobj(BTC_DB_BUCKET, BTC_DB_NAME + ".db", f)

        with open(BTC_DB_LOCAL + ".meta", "wb") as f:
            client.download_fileobj(BTC_DB_BUCKET, BTC_DB_NAME + ".meta", f)

        with open(os.path.join(local_dir, BTC_BLOCK_TIMESTAMPS), "wb") as f:
            client.download_fileobj(BTC_DB_BUCKET, BTC_BLOCK_TIMESTAMPS, f)

    except Exception as e:
        print(e)
        return False
    return True


def preprocess_db(local_dir: str) -> bool:
    try:
        BTC_DB_LOCAL = os.path.join(local_dir, BTC_DB_NAME)
        cmd = [
            "/spiral/bin/preprocess_db",
            BTC_DB_LOCAL + ".db",
            BTC_DB_LOCAL + ".dbp",
            "14",
            "65536",
        ]
        result = subprocess.run(cmd)
        return result.returncode == 0
    except Exception as e:
        print(e)
    return False


def reload_worker() -> bool:
    try:
        # host.docker.internal
        update_response = requests.post('http://worker:9089/reload')
        print(update_response.text)
        return True
    except Exception as e:
        print(e)
    return False


def main(local_dir):
    client = boto3.client("s3")
    current_etag = None
    while True:
        time.sleep(2)
        new_etag = get_s3_meta(client)

        if new_etag is None:
            print("failed to connect to S3")
            continue

        if new_etag != current_etag:
            print(f"Next DB ready: {new_etag}")
            start = time.time()

            ok = pull_latest_db(client, local_dir)
            if not ok:
                print("failed to pull DB")
                continue

            ok = meta_to_json(local_dir)
            if not ok:
                print("failed to construct info JSON (nonfatal)")

            ok = preprocess_db(local_dir)
            if not ok:
                print("failed to preprocess DB")
                continue

            end = time.time()
            print(f"New DB ready (took {(end-start):.2g}s). Reloading server")

            ok = reload_worker()
            if not ok:
                print("failed to reload server")
                continue

            current_etag = new_etag
            for _ in range(30):
                time.sleep(1)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        main(sys.argv[1])
    else:
        with tempfile.TemporaryDirectory() as local_root:
            local_dir = os.path.join(local_root, BTC_DB_BUCKET)
            os.mkdir(local_dir)
            print(f"writing scratch to: {local_dir}")
            main(local_dir)
