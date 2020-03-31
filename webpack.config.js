const path = require('path');
const fs = require('fs');
const webpack = require('webpack');
const ExtraWatchWebpackPlugin = require('extra-watch-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const sharedConfig = {
    module: {
        rules: [
            {
                test: /\.(woff2?|ttf|otf|eot|svg|html|ico)$/,
                use: [{
                    loader: 'file-loader',
                    options: { name: '[name].[ext]' }
                }]
            },
            {
                test: /\.(s*)css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader', 'resolve-url-loader', 'sass-loader'
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
            __PLUGIN_VERSION_TIMESTAMP__: webpack.DefinePlugin.runtimeValue(() => `${new Date().valueOf()}`, true),
            __RCSB_MOLSTAR_VERSION__: webpack.DefinePlugin.runtimeValue(() => {
                const version = JSON.parse(fs.readFileSync('./package.json')).version;
                return `'${version}'`;
            }, true),
            'process.env.DEBUG': JSON.stringify(process.env.DEBUG)
        }),
        new MiniCssExtractPlugin({ filename: 'app.css' })
    ],
    resolve: {
        modules: [
            'node_modules',
            path.resolve(__dirname, 'build/src/')
        ],
    },
    watchOptions: {
        aggregateTimeout: 750
    },
    devtool: ''
}

module.exports = [
    {
        node: { fs: 'empty' },
        entry: path.resolve(__dirname, `build/src/structure-viewer/index.js`),
        output: {
            library: 'app',
            libraryTarget: 'umd',
            filename: `app.js`,
            path: path.resolve(__dirname, `build/dist/structure-viewer`)
        },
        ...sharedConfig
    },
]