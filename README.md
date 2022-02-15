# Spiral Privacy Clients

This repository hosts our implementation of metadata-private clients.
Currently, this includes the Javascript code we use in our web client at [btc.usespiral.com](https://btc.usespiral.com).

## Build & Distribution
We use Github Actions to build the latest client, and make a Github release.

When your browser visits [btc.usespiral.com](https://btc.usespiral.com), it will confirm (using [SRI hashes](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)) that the served `bundle.js`, which is the only script that runs in the web client, is exactly the same as the GitHub-built `bundle.js`. Verify this yourself by comparing the SRI hash in the web client HTML to the hash of the `bundle.js` file from our latest GitHub release.

This arrangement does not address every security concern related to running cryptography in the browser. For maximum assuredness, you can build the client code from source and send requests directly to our trustless API server (see `sites/usespiral/js/main.js` for usage guidance).

## Client Build Instructions
- In `client`:
    - `wasm-pack build --target web --out-dir ../sites/usespiral/pkg`
- In `sites/usespiral`:
    - `webpack --config webpack.config.js`
- Generate SRI hash for your locally-built `bundle.js`:
    - `cat dist/bundle.js | openssl dgst -sha256 -binary | openssl base64 -A`
- Modify `sites/usespiral/index.html` to enforce the SRI hash you produced in the previous command. (Build environment differences between your system and GitHub's may result in different hashes for `bundle.js`)
- Use any local webserver (Caddy, python file-server, etc) to serve the `sites/usespiral` directory.

## Contact
founders@usespiral.com

## FAQ

### Is this project related to [Spiral by Block](spiral.xyz)?
No. Our name comes from the [Spiral cryptographic scheme](https://eprint.iacr.org/2022/368), which is itself an anagram of an older PIR scheme called "SealPIR".
We started work on Spiral in 2018, before we were aware of any naming conflicts.
