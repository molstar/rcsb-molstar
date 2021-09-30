const path = require('path');
const webpack = require('webpack');
const ExtraWatchWebpackPlugin = require('extra-watch-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const sharedConfig = {
    module: {
        rules: [
            {
                test: /\.(html|ico)$/,
                use: [{
                    loader: 'file-loader',
                    options: { name: '[name].[ext]' }
                }]
            },
            {
                test: /\.(s*)css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    { loader: 'css-loader', options: { sourceMap: false } },
                    { loader: 'sass-loader', options: { sourceMap: false } },
                ]
            }
        ]
    },
    plugins: [
        new ExtraWatchWebpackPlugin({
            files: [
                './build/**/*.scss',
                './build/**/*.html'
            ],
        }),
        new webpack.DefinePlugin({
            __BUILD_TIMESTAMP__: webpack.DefinePlugin.runtimeValue(() => `${new Date().valueOf()}`, true),
            __RCSB_MOLSTAR_VERSION__: webpack.DefinePlugin.runtimeValue(() => JSON.stringify(require('./package.json').version), true),
            'process.env.DEBUG': JSON.stringify(process.env.DEBUG)
        }),
        new MiniCssExtractPlugin({ filename: 'rcsb-molstar.css' })
    ],
    resolve: {
        modules: [
            'node_modules',
            path.resolve(__dirname, 'build/src/')
        ],
        fallback: {
            fs: false,
            buffer: require.resolve('buffer'),
            crypto: require.resolve('crypto-browserify'),
            path: require.resolve('path-browserify'),
            stream: require.resolve('stream-browserify')
        }
    },
    watchOptions: {
        aggregateTimeout: 750
    },
    devtool: false
};

module.exports = [
    {
        entry: path.resolve(__dirname, `build/src/viewer/index.js`),
        output: {
            library: 'rcsbMolstar',
            libraryTarget: 'umd',
            filename: `rcsb-molstar.js`,
            path: path.resolve(__dirname, `build/dist/viewer`)
        },
        ...sharedConfig
    },{
        entry: path.resolve(__dirname, `build/src/viewer/assets.js`),
        output: {
            path: path.resolve(__dirname, `build/dist/viewer`)
        },
        ...sharedConfig
    }
];