const path = require('path');

module.exports = {
    mode: 'production',
    entry: ['./js/main.js',],
    module: {
        rules: [
            {
                test: /\.wasm$/,
                type: "asset/inline",
            },
        ],
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    experiments: {
        asyncWebAssembly: true,
    },
};