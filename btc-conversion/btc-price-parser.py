import json
import sys

try:
    price = json.load(sys.stdin)["USD"]["15m"]
    print('{"price": ' + str(price) + '}')
except:
    print('\n')