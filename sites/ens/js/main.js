import init, {
  initialize,
  generate_keys,
  generate_query,
  decode_response
} from '../pkg/client.js';

import pako from './pako.js'

import * as namehash from './eth-ens-namehash.js';

const API_URL = "https://staging.usespiral.com/ensv1";
const QUERY_URL = "/query";
const UUID_V4_LEN = 36;

const ETH_ADDR_BYTES = 20;
const NODE_PREFIX_BYTES = 16;
const KEY_SIZE = 32;

const TARGET_NUM = 12;

const PARAMS = {
  "direct_upload": 1,
  "n": 1,
  "nu_1": 6,
  "nu_2": 6,
  "p": 65536,
  "q2_bits": 27,
  "instances": 8,
  "t_gsw": 3,
  "t_conv": 14,
  "t_exp_left": 56,
  "t_exp_right": 56
}

function startLoading(message, hasProgress) {
  window.loading = true;
  window.started_loading = Date.now();
  document.querySelector(".placeholder").classList.add("off");
  if (hasProgress) {
    document.querySelector(".progress").classList.remove("off");
    document.querySelector(".loading-icon").classList.add("off");
  } else {
    document.querySelector(".progress").classList.add("off");
    document.querySelector(".loading-icon").classList.remove("off");
    document.querySelector(".loading-icon").classList.remove("hidden");
  }
  console.log(message);
  document.querySelector(".loading .message").classList.add("inprogress");
}
window.startLoading = startLoading;

function setProgress(progress) {
  document.querySelector(".progress").style.background =
    "conic-gradient(#666 " +
    progress +
    "%,#eee " +
    progress +
    "%)";
}
window.setProgress = setProgress;

function stopLoading(message) {
  window.loading = false;
  document.querySelector(".loading-icon").classList.add("hidden");
  let seconds = (Date.now() - window.started_loading) / 1000
  let secondsRounded = Math.round(seconds * 100) / 100;
  let timingMessage = secondsRounded > 0.01 ? (" Took " + secondsRounded + "s.") : "";
  if (message) console.log("Done " + message.toLowerCase() + "." + timingMessage);
  document.querySelector(".loading .message").classList.remove("inprogress");
}
window.stopLoading = stopLoading;


async function postData(url = '', data = {}, json = false) {
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
  query: async (data) => postData(API_URL + QUERY_URL, data, false),
}

function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)]
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
}

function hexToUint8Array(hex) {
  return new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
    return parseInt(h, 16)
  }))  
}

function readStr(dv, buffer, i) {
  let dec = new TextDecoder("utf-8");
  let strLen = dv.getUint8(i);
  i += 1;
  let str = dec.decode(buffer.slice(i, i + strLen));
  i += strLen;
  return {i, str};
}

function parseResult(result, hash) {
  let output;
  try {
    output = pako.inflate(result);
  } catch (err) {
    console.log(err);
    return '<div class="error-msg">Error retrieving balance for this address.</div>';
  }

  let matches = 0;
  let entryInfo = null;
  let dv = new DataView(output.buffer);
  let i = 0; 
  while (i < output.length) {
    let entry = {};
    let node = output.buffer.slice(i, i + NODE_PREFIX_BYTES)
    i += NODE_PREFIX_BYTES;
    let numAddr = dv.getUint8(i);
    i += 1;
    let numKeys = dv.getUint8(i);
    i += 1;
    if (numAddr == 1) {
      // read address
      entry.address = arrayBufferToHex(output.buffer.slice(i, i + ETH_ADDR_BYTES));
      i += ETH_ADDR_BYTES;
    }
    if (numKeys > 0) {
      entry.data = {};
      for (let k = 0; k < numKeys; k++) {
        let str;
        ({i, str} = readStr(dv, output.buffer, i));
        let key = str;
        ({i, str} = readStr(dv, output.buffer, i));
        let value = str;

        entry.data[key] = value;
      }
    }

    entry.node = arrayBufferToHex(node);

    if (new Uint8Array(node).every((v,i)=> v === hash[i])) {
      matches += 1;
      entryInfo = entry;
    }
  }

  if (matches == 0) {
    return '<div class="error-msg">No balance found for this address (perhaps 0?)</div>';
  } else if (matches > 1) {
    return '<div class="error-msg">Error retrieving balance for this address.</div>';
  }

  return entryInfo;
}

function keyValueHtml(key, value) {
  if (value.startsWith("http")) {
    value = `<a href="${value}" target="_blank" rel="noreferrer noopener">${value}</a>`;
  }
  if (key === "com.twitter") {
    key = "twitter";
    value = `<a href="https://twitter.com/${value}" target="_blank" rel="noreferrer noopener">@${value}</a>`;
  }
  return `<div class="key-value">
    <div class="key">${key}</div>
    <div class="value">${value}</div>
  </div>`
}

function resultToHtml(result, hash, name) {
  let entry = parseResult(result, hash);
  if (typeof entry === 'string') return entry;

  let sortedKeys = entry.data ? Object.keys(entry.data) : [];
  sortedKeys.sort();

  return `<div class="result-inset">
    <div class="name"><a href="/#${name}">${name}</a></div>
    ${entry.address ? keyValueHtml("address", entry.address) : ""}
    ${sortedKeys.map((k) => keyValueHtml(k, entry.data[k])).join('\n')}
  </div>`;
}

function getBucketFromHash(hash) {
  let hashInt = BigInt(hash);
  let bucket = hashInt & BigInt((1 << TARGET_NUM) - 1);
  return Number(bucket);
}

async function query(name) {
  await init();

  console.log("!!!!");
  window.namehash = namehash;
  let normalizedName = namehash.normalize(name);
  let hash = namehash.hash(normalizedName);
  let hashArray  = hexToUint8Array(hash);
  console.log(hash);

  let targetIdx = getBucketFromHash(hash);

  let client = initialize(JSON.stringify(PARAMS));
  console.log("???");
  let key = new Uint8Array(KEY_SIZE);
  crypto.getRandomValues(key, true);
  let publicParameters = generate_keys(client, key, true);
  let query = generate_query(client, "0".repeat(UUID_V4_LEN), targetIdx);
  let fullQuery = new Uint8Array(publicParameters.length + query.length - UUID_V4_LEN);
  fullQuery.set(publicParameters);
  fullQuery.set(query.slice(UUID_V4_LEN), publicParameters.length);
  let response = new Uint8Array(await api.query(fullQuery));
  let result = decode_response(client, response);
  console.log("Final result:")
  console.log(result);

  let resultHtml = await resultToHtml(result, hashArray, normalizedName);
  let outputArea = document.getElementById("output");
  outputArea.innerHTML = resultHtml;
  outputArea.classList.remove("centered");
}

async function queryIfPossible() {
  let hashStr = window.location.hash;
  if (hashStr.length > 1 && hashStr.endsWith(".eth")) {
    document.title = "Spiral: " + hashStr.slice(1);
    document.getElementById("output").innerHTML = "";
    startLoading();
    await query(hashStr.slice(1));
    stopLoading();
  } else {
    stopLoading();
    document.querySelector(".placeholder").classList.remove("off");
  }
}

window.addEventListener('load', queryIfPossible);
window.addEventListener('hashchange', queryIfPossible);