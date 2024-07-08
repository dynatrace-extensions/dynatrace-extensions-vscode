const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/index.tsx',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          }
        }
      },
      {
  test: /\.css$/,
    use: ['style-loader', 'css-loader'],
      },
    ],
  },
plugins: [
  new HtmlWebpackPlugin({
    template: './public/index.html',
  }),
  new ForkTsCheckerWebpackPlugin(),
],
  resolve: {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  plugins: [new TsconfigPathsPlugin({ configFile: "./tsconfig.json" })],
  },
optimization: {
  splitChunks: {
    cacheGroups: {
        default: false,
      },
  },
  runtimeChunk: false,
  },
};
