import init, { 
    initialize,
    generate_keys,
    generate_query,
    decode_response
} from '../pkg/client.js';

const API_URL = "https://api.usespiral.com/btcv1";
const CHECK_URL = "/check";
const SETUP_URL = "/setup";
const QUERY_URL = "/query";
const BT_URL = "/block-timestamps";

const BASE_BT_HEIGHT_URL = "/static/block-timestamps.json";
const BASE_BT_HEIGHT = 753388;

const AMOUNT_SIZE = 8;
const ADDR_HASH_SIZE = 8;
const DATUM_SIZE = ADDR_HASH_SIZE + AMOUNT_SIZE;
const MAX_TXNS = 5;
const NUM_TXN_SIZE = 1;
const HEIGHT_SIZE = 4;
const TXN_SIZE = HEIGHT_SIZE + AMOUNT_SIZE;

const MAX_BTC = 21e14;
const SAT_IN_BTC = BigInt("100000000");

const TARGET_NUM = 14;
const ITEM_SIZE = 65536;
const PARAMS = {
    "n": 4,
    "nu_1": 9,
    "nu_2": 5,
    "p": 256,
    "q2_bits": 20,
    "t_gsw": 8,
    "t_conv": 4,
    "t_exp_left": 8,
    "t_exp_right": 56,
    "instances": 2,
    "db_item_size": 65536
};

async function postData(url = '', data = {}, json = false) {
    // const response = await fetch(url, {
    //   method: 'POST',
    //   mode: 'cors',
    //   cache: 'no-store',
    //   credentials: 'omit',
    //   headers: { 
    //       'Content-Type': 'application/octet-stream',
    //       'Content-Length': data.length
    //   },
    //   redirect: 'follow',
    //   referrerPolicy: 'no-referrer',
    //   body: data
    // });
    // if (json) {
    //     return response.json();
    // } else {
    //     let data = await response.arrayBuffer();
    //     return new Uint8Array(data);
    // }

    // Can't use Fetch API here since it lacks progress indication
    const xhr = new XMLHttpRequest();
    xhr.responseType = json ? 'json' : 'arraybuffer';
    return await new Promise((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
                setProgress(Math.round(event.loaded / event.total * 100))
            }
        });
        xhr.addEventListener("loadend", () => {
            resolve(xhr.readyState === 4 && xhr.status === 200);
        });
        xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject({
                    status: xhr.status,
                    statusText: xhr.statusText
                });
            }
        };
        xhr.onerror = function () {
            reject({
                status: xhr.status,
                statusText: xhr.statusText
            });
        };
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "application/octet-stream");
        xhr.send(new Blob([data.buffer]));
    });
}

async function getData(url = '', json = false) {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'default',
      credentials: 'omit',
      redirect: 'follow',
      referrerPolicy: 'no-referrer'
    });
    if (json) {
        return response.json();
    } else {
        let data = await response.arrayBuffer();
        return new Uint8Array(data);
    }
}

const api = {
    check: async (uuid) => getData(API_URL + CHECK_URL + "?uuid="+uuid, true),
    setup: async (data) => postData(API_URL + SETUP_URL, data, true),
    query: async (data) => postData(API_URL + QUERY_URL, data, false),
    blockTimestampsBase: async () => getData(BASE_BT_HEIGHT_URL, true),
    blockTimestampsLive: async () => getData(API_URL + BT_URL, true)
}

async function sha256Trunc(message) {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    return hashBuffer.slice(0, ADDR_HASH_SIZE);
}

function getHexFromHash(hash) {
    let hashArray = Array.from(new Uint8Array(hash));
    hashArray.reverse();
    let hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function getBucketFromAddressHash(hash) {
    let hashInt = BigInt("0x"+getHexFromHash(hash));
    let bucket = hashInt & BigInt((1 << TARGET_NUM) - 1);
    return Number(bucket);
}

async function getAddressInfo(address) {
    let hash = await sha256Trunc(address);
    let bucket = getBucketFromAddressHash(hash);
    return {"hash": hash, "bucket": bucket};
}

function getTxns(dv, offset) {
    // read until we get an address
    let numTxns = dv.getUint8(offset, true);
    let txns = [];
    for (let i = 0; i < numTxns; i++) {
        let idx = offset + NUM_TXN_SIZE + i * TXN_SIZE;
        if (idx + 4 > dv.byteLength) throw "bad 1";
        let candBlockHeight = dv.getUint32(idx, true);
        if (candBlockHeight > window.blockHeight) throw "bad 2";
        if (idx + HEIGHT_SIZE + 8 > dv.byteLength) break;
        let amount = dv.getBigUint64(idx + HEIGHT_SIZE, true);
        if (amount > MAX_BTC) throw "bad 3";
        txns.push({"height": candBlockHeight, "amount": amount})
    }
    if (txns.length == 0) throw "bad 4";
    txns.sort((x,y) => {return y.height - x.height});
    return txns;
}

window.USD_FORMATTER = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
});  

function amountToString(amountSats, symbol) {
    if (!symbol) symbol = "";
    let el = "div";
    let amount = Number(amountSats) / Number(SAT_IN_BTC);
    let btcOpts = {
        trailingZeroDisplay: "stripIfInteger",
        maximumFractionDigits: 2
    };

    if (amount < 1.0) {
        btcOpts = {
            trailingZeroDisplay: "stripIfInteger",
            minimumSignificantDigits: 1
        }
    }

    return '<'+el+' class="primary" '
        + 'title="'
        + amountSats.toString() 
        + " sat"
        + '"'
        + '>' 
        + '<span class="number good">'
        + symbol
        + amount.toLocaleString("en-US", btcOpts) 
        + '</span>'
        + ' BTC'
        + '</'+el+'> '
        + '<'+el+' class="secondary">' 
        + '(' 
        + '<span class="number good">'
        + window.USD_FORMATTER.format(getUSD(Number(amount))) 
        + '</span>'
        + ')' 
        + '</'+el+'>';
}

window.relTimeFormatter = new Intl.RelativeTimeFormat('en', { style: 'long' });

function getRelativeTime(d) {
    let units = {
        year  : 24 * 60 * 60 * 1000 * 365,
        month : 24 * 60 * 60 * 1000 * 365/12,
        day   : 24 * 60 * 60 * 1000,
        hour  : 60 * 60 * 1000,
        minute: 60 * 1000,
        second: 1000
    };

    var elapsed = d - new Date();
    
    for (var u in units) 
      if (Math.abs(elapsed) > units[u] || u == 'second') 
        return window.relTimeFormatter.format(Math.round(elapsed/units[u]), u)
}

function txnToString(txn) {
    let timeStr;
    if (window.blockTimestamps && window.blockTimestamps[txn.height]) {
        let timestamp = window.blockTimestamps[txn.height];
        let d = new Date(timestamp * 1000);
        let relTimeStr = getRelativeTime(d);
        timeStr = '<span class="relative-time-detail" '
            + 'title="'
            + d.toLocaleString()
            + '">' 
            + relTimeStr 
            + '</span>'
            + '<span class="height-detail">'
            + " (block " 
            + txn.height 
            + ")"
            + '</span>';
    } else {
        timeStr = "Block " + txn.height;
    }

    return '<div class="txn platter">'
        + '<div class="description">'
        + timeStr
        + '</div>'
        + '<div class="result">'
        + amountToString(txn.amount, "+") + 
        '</div>' +
        '</div>';
}

function wrapBalance(balanceString) {
    return '<div class="balance platter main">'
        + '<div class="description">Balance</div>'
        + '<div class="result">'
        + balanceString + 
        '</div>' +
        '</div>';
}

function wrapTxns(txnString) {
    return '<div class="txns">'
        +'<div class="platter caption">Recent transactions:</div>\n'
        + txnString + 
        '</div>';
}

async function resultToHtml(result, title) {
    let addressHash = new Uint8Array((await getAddressInfo(title)).hash);
    let output;
    try {
      output = pako.inflate(result);
    } catch (err) {
      console.log(err);
      return "Error retrieving balance for this address.";
    }

    // let data = {};
    let matches = 0;
    let balanceSats = 0;
    let txns;
    let dv = new DataView(output.buffer);
    let i = 0; 
    while (i < output.length) {
        let candidateAddr = output.slice(i, i + ADDR_HASH_SIZE);
        let candidateTxns = getTxns(dv, i + ADDR_HASH_SIZE + AMOUNT_SIZE);
        if (candidateAddr.every((v,i)=> v === addressHash[i])) {
            matches += 1;
            balanceSats = dv.getBigUint64(i + ADDR_HASH_SIZE, true);
            txns = candidateTxns;
        }
        i += ADDR_HASH_SIZE + AMOUNT_SIZE + NUM_TXN_SIZE + candidateTxns.length * TXN_SIZE;
        // data[getHexFromHash(candidateAddr)] = dv.getBigUint64(i + ADDR_HASH_SIZE, true).toString();
    }

    if (matches == 0) {
        return "No balance found for this address (perhaps 0?)";
    } else if (matches > 1) {
        return "Error retrieving balance for this address.";
    }

    let balanceString = amountToString(balanceSats);
    let txnString = '<div class="txnlist">' + txns.map(txnToString).join("\n") + "</div>"; 

    return wrapBalance(balanceString) + '\n' + wrapTxns(txnString);
    
}

function parseLastUpdated(data) {
    let lastUpdated = data["lastupdate"];
    let blockHeight = data["height"];
    window.blockHeight = parseInt(blockHeight);
    let date = (new Date(lastUpdated)).toLocaleString()
    return "Current as of block " + blockHeight + " (" + date + ")";
}

async function updateInfo() {
    var myHeaders = new Headers();
    myHeaders.append('pragma', 'no-cache');
    myHeaders.append('cache-control', 'no-cache');

    var myInit = {
        method: 'GET',
        headers: myHeaders,
    };

    var myRequest = new Request(API_URL + "/info");
    let data = (await (await fetch(myRequest, myInit)).json());

    document.getElementById("currentasof").innerHTML
        = parseLastUpdated(data);

    window.usdPerBtc = parseFloat(data["price"]);
}

function getUSD(btcVal) {
    return window.usdPerBtc * btcVal;
}

function startLoading(message, hasProgress) {
    window.loading = true;
    window.started_loading = Date.now();
    document.querySelector("#make_query").classList.add("off");
    if (hasProgress) {
        document.querySelector(".progress").classList.remove("off");
        document.querySelector(".loading-icon").classList.add("off");
    } else {
        document.querySelector(".progress").classList.add("off");
        document.querySelector(".loading-icon").classList.remove("off");
    }
    // document.querySelector(".loading .message").innerHTML = message+"...";
    document.querySelector(".loading .message").classList.add("inprogress");
}

window.startLoading = startLoading;

function stopLoading(message) {
    window.loading = false;
    document.querySelector(".loading-icon").classList.add("off");
    document.querySelector("#make_query").classList.remove("off");
    let seconds = (Date.now() - window.started_loading) / 1000
    let secondsRounded = Math.round(seconds * 100) / 100;
    let timingMessage = secondsRounded > 0.01 ? (" Took "+secondsRounded+"s.") : "";
    console.log("Done " + message.toLowerCase() + "." + timingMessage)
    // document.querySelector(".loading .message").innerHTML = "Done " + message.toLowerCase() + "." + timingMessage;
    document.querySelector(".loading .message").classList.remove("inprogress");
}

const DB_NAME = 'spiralBalancesKey';
const KEY_SIZE = 32;
const MAX_VALID_TIME = 604800000; // 1 week

async function arrayBufferToBase64(data) {
    const base64url = await new Promise((r) => {
        const reader = new FileReader()
        reader.onload = () => r(reader.result)
        reader.readAsDataURL(new Blob([data]))
    })
    return base64url.split(",", 2)[1]
}

function base64ToArrayBuffer(str) {
    return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function storeState(key, uuid) {
    console.log(key);
    let dataToStore = {
        "key": await arrayBufferToBase64(key),
        "uuid": uuid,
        "createdAt": Date.now()
    }
    window.localStorage[DB_NAME] = JSON.stringify(dataToStore);
}

function retrieveState() {
    if (!window.localStorage || !window.localStorage[DB_NAME]) return false;
    let state = JSON.parse(window.localStorage[DB_NAME]);
    state["key"] = base64ToArrayBuffer(state["key"]);
    return state;
}

function setStateFromKey(key, shouldGeneratePubParams) {
    console.log("Initializing...");
    window.key = key;
    window.client = initialize(JSON.stringify(PARAMS));
    console.log("done");
    console.log("Generating public parameters...");
    window.publicParameters = generate_keys(window.client, key, shouldGeneratePubParams);
    if (window.publicParameters) console.log(`done (${publicParameters.length} bytes)`);
}

async function isStateValid(state) {
    console.log("Checking if cached state is still valid")
    if (Date.now() - state.createdAt > MAX_VALID_TIME) return false;
        
    let isValidResponse = await api.check(state.uuid);
    let isValid = isValidResponse.is_valid;
    if (!isValid) return false;

    return true;
}

async function setUpClient() {
    let state = retrieveState();
    if (state && await isStateValid(state)) {
        console.log("Loading previous client state")
        setStateFromKey(state.key, false);
        window.id = state.uuid;
        return true;
    } else {
        console.log("No state stored, generating new client state")
        let key = new Uint8Array(KEY_SIZE);
        self.crypto.getRandomValues(key, true);
        setStateFromKey(key, true);
        return false;
    }
}

async function uploadState() {
    startLoading("Uploading setup data", true);
    console.log("Sending public parameters...");
    let setup_resp = await api.setup(window.publicParameters);
    console.log("sent.");
    let id = setup_resp["id"];
    // stopLoading("Uploading setup data");
    await storeState(window.key, id);
    return id;
}

async function query(targetIdx, title) {
    if (!window.hasSetUp) {
        let id = await uploadState();
        if (!id) return false;
        window.hasSetUp = true;
        window.id = id;
    }

    stopLoading("");
    startLoading("Loading");
    console.log("Generating query... ("+targetIdx+")");
    let query = generate_query(window.client, window.id, targetIdx);
    console.log(`done (${query.length} bytes)`);

    console.log("Sending query...");
    let response = new Uint8Array(await api.query(query));
    console.log("sent.");

    console.log(`done, got (${response.length} bytes)`);

    console.log("Decoding result...");
    let result = decode_response(window.client, response)
    console.log("done.")
    console.log("Final result:")
    console.log(result);

    let resultHtml = await resultToHtml(result, title);

    let outputArea = document.getElementById("output");
    outputArea.innerHTML = resultHtml;

    await updateInfo();

    document.getElementById("currentasof").classList.remove("off");

    document.querySelector(".resultcard").classList.remove("collapsed")

    stopLoading("Loading");
}

async function queryTitle(targetTitle) {
    targetTitle = targetTitle.trim();
    if (targetTitle.includes(" ")) {
        alert("Bad address!")
        return;
    }

    let bucket = (await getAddressInfo(targetTitle)).bucket;
    return await query(bucket, targetTitle);
}

function processBTBaseArray(btArray) {
    let mapping = {};
    let current = 0;
    for (let i = 0; i < btArray.length; i++) {
        let delta = btArray[i];
        current += delta;
        mapping[i] = current;
    }
    
    return mapping;
}

async function run() {
    startLoading("Initializing");
    await init();
    stopLoading("Initializing");

    api.blockTimestampsBase().then((res) => {
        window.blockTimestamps = processBTBaseArray(res);
    });

    window.numArticles = 1 << TARGET_NUM;
    window.articleSize = ITEM_SIZE;

    let makeQueryBtn = document.getElementById('make_query');
    let searchBox = document.getElementById("searchbox");
    // document.querySelector(".sidebar-collapse-btn").onclick = () => {
    //     document.querySelector(".sidebar").classList.toggle("collapsed");
    // }

    await updateInfo();

    startLoading("Setting up client");
    let setupClientResult = setUpClient();
    window.hasSetUp = await setupClientResult;
    stopLoading("Setting up client");

    let clickAction = async () => {
        makeQueryBtn.disabled = true;
        await queryTitle(searchBox.value);
        makeQueryBtn.disabled = false;
    }

    makeQueryBtn.onclick = clickAction;

    searchBox.addEventListener("keypress", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            clickAction();
        }
    });
}
run();

function setProgress(progress) {
    document.querySelector(".progress").style.background =
        "conic-gradient(#fff " +
        progress +
        "%,rgba(103,38,103,1) " +
        progress +
        "%)";

    // document.getElementById("middle-circle").innerHTML =
    //     progress.toString() + "%";
}
window.setProgress = setProgress;