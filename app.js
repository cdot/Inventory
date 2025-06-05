/* global gapi */
/* global google */
/* global Html5QrcodeScanner */
//import { jwtDecode } from "./node_modules/jwt-decode/build/esm/index.js";

const API_KEY = 'AIzaSyBBJHoKnuEU4JMVNMUKRAy7utghHY2E1pc';
const CLIENT_ID = '158587985006-7urp3k2114kgl4sqqro2pbe014d80qaq.apps.googleusercontent.com';
const CLIENT_PARAMS = {
  apiKey: API_KEY,
  discoveryDocs: [
    "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest" ],
  clientId: CLIENT_ID,
  scope: "https://www.googleapis.com/auth/drive"
};

const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

const SHEET_ID = 'YOUR_SHEET_ID_HERE';
const SHEET_NAME = 'Sheet1';
const SHEET_RANGE = `${SHEET_NAME}!A:C`; // Adjust range as needed

/**
 * Parse the URL to extract parameters. Arguments following `?` are
 * returned as keys in a map. The portion of the URL before `?` is
 * returned in the argument map using the special key
 * `_URL`. Arguments that have no value are set to boolean
 * `true`. Repeated arguments are not supported (the last value will
 * be the one taken). Values recognised as floating-point numbers are
 * converted to numbers. A `(` immediately following a `=` is interpreted
 * as wrapping a sub-object, thus:
 * ```
 * example?colours=(red=F00,green=0F0,blue=00F)
 * ```
 * will be parsed as:
 * ```
 * { _URL: "example", colours: { red: "F00", green: "0F0", blue: "00F" }}
 * ```
 * `;` and `(` in values must be be escaped by url encoding.
 * @return {Object<string,string>} key-value map
 */
function parseURLArguments(url) {
  let args = "", match;
  if ((match = /^(.*?)\?(.*)?$/.exec(url))) {
    url = match[1];
    args = match[2] || "";
  }

  // Replace nested blocks with placeholders
  const placeholders = [];
  let changed = true;
  while (changed) {
    //console.log("Scan", args);
    changed = false;
    args = args.replace(/([^;&(=]+)=\(([^()]*)\)/g, (match, k, v) => {
      placeholders.push(v);
      changed = true;
      const res = `${k}=?${placeholders.length - 1}?`;
      //console.debug(`Hoisted ${v} => ${res}`);
      return res;
    });
  }

  function parseArgs(args) {
    const obj = {};
    args = args.replace(/([;&]|^)([^;&(=]+)=\?(\d+)\?/g, (match, i, k, v) => {
      //console.debug("Expand", v);
      v = placeholders[v];
      //console.debug(`Object ${match}, ${k} = ${v}`);
      obj[decodeURIComponent(k)] = parseArgs(v, {});
      return "";
    })
    .replace(/([;&]|^)([^;&=]*)=([^;&]*)/g, (match, i, k, v) => {
      //console.debug(`Value ${match}, ${k} = ${v}`);
      const key = decodeURIComponent(k);
      if (v.length === 0)
        obj[key] = "";
      else {
        const nvalue = Number(v);
        if (isNaN(nvalue))
          obj[key] = decodeURIComponent(v);
        else
          obj[key] = nvalue;
      }
      return "";
    })
    .replace(/[^;&=]+/g, match => {
      //console.debug(`Boolean ${match}`);
      obj[decodeURIComponent(match)] = true;
      return "";
    });

    if (/[^;&]/.test(args))
      throw new Error(`Unparseable ${args}`);

    return obj;
  }

  const obj = parseArgs(args);
  obj._URL = url;
  return obj;
}

// Read data
function readSheet() {
  return gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE
  }).then(response => {
    const rows = response.result.values;
    return rows;
  });
}

// Write data
function updateSheet(values) {
  const params = {
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: "RAW"
  };
  const valueRangeBody = {
    values: values
  };
  return gapi.client.sheets.spreadsheets.values.update(params, valueRangeBody)
    .then(response => {
      console.log("Sheet updated:", response);
    });
}

function lookupBarcode(barcode) {
  readSheet()
  .then(rows => {
    const rowIndex = rows.findIndex(row => row[0] === barcode);
    if (rowIndex !== -1) {
      // Barcode found, update quantity
      rows[rowIndex][2] = parseInt(rows[rowIndex][2]) + 1; // Increment quantity
      updateSheet(rows);
    } else {
      // Barcode not found, add new row
      console.log("Adding row for barcode", barcode);
      const newRow = [barcode, "Description", ""];
      rows.push(newRow);
      updateSheet(rows);
    }
  })
  .catch(err => {
    console.error(err);
    document.getElementById('result').innerText = 'Error fetching data.';
  });
}

function onScanSuccess(decodedText, decodedResult) {
  document.getElementById('scanned-code').innerText = decodedText;
  lookupBarcode(decodedText);
}

function scanBarcode() {
  const html5QrcodeScanner = new Html5QrcodeScanner(
    "reader", { fps: 10, qrbox: 250 });
  html5QrcodeScanner.render(onScanSuccess);
}

const gisLoaded = new Promise(resolve => {
  return import("https://accounts.google.com/gsi/client")
  .then(() => {
    function handleCredentialResponse(response) {
      const { credential } = response;
      const decodedJwt = jwtDecode(credential);
      console.log(decodedJwt);
      resolve();
    }

    if (typeof google !== 'undefined' && google.accounts) {
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredentialResponse
      });
      google.accounts.id.renderButton(
        document.getElementById("googleButton"),
        { theme: "outline", size: "large" }
      );
      google.accounts.id.prompt(); // Display the One Tap prompt
    } else {
      console.error("Google Identity Services not loaded.");
    }
  });
});

function gapiLoaded() {
  const args = parseURLArguments(window.location.href);
  //if (args.auth) promises.push(gisLoaded);
  readSheet().then(rows => console.log(rows));
  //scanBarcode();
}

function apisLoaded() {
  gapi.load("client", () => {
    console.debug("gapi.client loaded");
    gapi.client.load(
      'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest')
    .then(() => gapi.client.init(CLIENT_PARAMS))
    .then(() => gapiLoaded());
  });
}

