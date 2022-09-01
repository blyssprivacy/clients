#!/usr/bin/env bash

curl -s https://blockchain.info/ticker | python3 /home/samir/spiral-rs/btc-conversion/btc-price-parser.py > /var/www/html/balances/info/btcconversionrate.json