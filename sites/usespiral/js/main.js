import init, { 
    initialize,
    generate_keys,
    generate_query,
    decode_response
} from '../pkg/client.js';

const API_URL = "/balances/api";
const CHECK_URL = "/check";
const SETUP_URL = "/setup";
const QUERY_URL = "/query";

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
    query: async (data) => postData(API_URL + QUERY_URL, data, false)
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

function amountToString(amountSats) {
    let amount = Number(amountSats) / Number(SAT_IN_BTC);

    return amount.toLocaleString("en-US") 
        + " BTC (" 
        + window.USD_FORMATTER.format(getUSD(amount)) 
        + " USD, " 
        + amountSats.toString() 
        + " sat)";
}

function txnToString(txn) {
    return "In block " + txn.height + ", got " + amountToString(txn.amount);
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
    let txnString = '<ul class="txnlist">' + txns.map(txnToString).map((x) => "<li>"+x+"</li>").join("\n") + "</ul>"; 

    return '<div class="balance">'+balanceString+'</div>\n<div class="txns">Recent transactions:\n'+txnString+'</div>';
}

function parseLastUpdated(lastUpdated) {
    let parts = lastUpdated.split(",");
    let blockHeight = parts[0];
    window.blockHeight = parseInt(blockHeight);
    let date = (new Date(parts[1])).toLocaleString()
    return "as of block " + blockHeight + " (" + date + ")";
}

async function updateInfo() {
    var myHeaders = new Headers();
    myHeaders.append('pragma', 'no-cache');
    myHeaders.append('cache-control', 'no-cache');

    var myInit = {
        method: 'GET',
        headers: myHeaders,
    };

    var myRequest = new Request("info/lastupdated.txt");

    let lastUpdated = await (await fetch(myRequest, myInit)).text();
    document.querySelector(".currentasof").innerHTML
        = parseLastUpdated(lastUpdated);

    var myRequest = new Request("info/btcconversionrate.json");

    window.usdPerBtc = (await (await fetch(myRequest, myInit)).json())["price"];
}

function getUSD(btcVal) {
    return window.usdPerBtc * btcVal;
}

function startLoading(message, hasProgress) {
    window.loading = true;
    window.started_loading = Date.now();
    if (hasProgress) {
        document.querySelector(".progress").classList.remove("off");
        document.querySelector(".loading-icon").classList.add("off");
    } else {
        document.querySelector(".progress").classList.add("off");
        document.querySelector(".loading-icon").classList.remove("off");
        document.querySelector(".loading-icon").classList.remove("hidden");
    }
    document.querySelector(".loading .message").innerHTML = message+"...";
    document.querySelector(".loading .message").classList.add("inprogress");
}

function stopLoading(message) {
    window.loading = false;
    document.querySelector(".loading-icon").classList.add("hidden");
    let seconds = (Date.now() - window.started_loading) / 1000
    let secondsRounded = Math.round(seconds * 100) / 100;
    let timingMessage = secondsRounded > 0.01 ? (" Took "+secondsRounded+"s.") : "";
    document.querySelector(".loading .message").innerHTML = "Done " + message.toLowerCase() + "." + timingMessage;
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
    stopLoading("Uploading setup data");
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

async function run() {
    startLoading("Initializing");
    await init();
    stopLoading("Initializing");

    window.numArticles = 1 << TARGET_NUM;
    window.articleSize = ITEM_SIZE;

    let makeQueryBtn = document.querySelector('#make_query');
    let searchBox = document.querySelector(".searchbox");
    document.querySelector(".sidebar-collapse-btn").onclick = () => {
        document.querySelector(".sidebar").classList.toggle("collapsed");
    }

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
        "conic-gradient(#333 " +
        progress +
        "%,#fff " +
        progress +
        "%)";

    // document.getElementById("middle-circle").innerHTML =
    //     progress.toString() + "%";
}
window.setProgress = setProgress;