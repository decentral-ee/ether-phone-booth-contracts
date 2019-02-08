const {
    resolve,
    join
} = require("path");
const {
    IgnorePlugin
} = require("webpack");
const path = require("path");

const moduleRoot = resolve(__dirname, "..", "..");
const outputPath = join(moduleRoot, "build");

module.exports = {
    mode: "production",
    entry: join(moduleRoot, "index.js"),
    target: "web",
    devtool: "source-map",
    output: {
        path: outputPath,
        filename: "ether-phone-booth-web-sdk.js",
        library: "EtherPhoneBooth",
        libraryTarget: "umd",
        umdNamedDefine: true
    },
    externals: ['net', 'xmlhttprequest'],
    resolve: {
        alias: {
            // eth-block-tracker is es6 but automatically builds an es5 version for us on install. thanks eth-block-tracker!
            //"eth-block-tracker": "eth-block-tracker/dist/es5/index.js",

            // replace native `scrypt` module with pure js `js-scrypt`
            // "scrypt": "scrypt-js",

            // replace native `secp256k1` with pure js `elliptic.js`
            // "secp256k1": "secp256k1/elliptic.js",

            // https://stackoverflow.com/questions/42237018/bundle-sha3-binary-modules-with-webpack
            // "sha3": "sha3/build/Release/sha3.node"
        }
    },
    module: {
        rules: [
            {test: /\.node$/, use: 'node-loader'},
        ]
    },
    plugins: [
        // ignore these plugins completely
        new IgnorePlugin(/^(?:electron|ws)$/)
    ]
};
