const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/renderer/index.tsx',
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'renderer.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
    fallback: {
      "path": false,
      "fs": false,
      "crypto": false,
      "stream": false,
      "buffer": false,
      "util": false,
      "os": false,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
    }),
    // 复制 TinyMCE 静态资源到 dist 目录（本地部署，不使用 CDN）
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'node_modules/tinymce/tinymce.min.js'),
          to: path.resolve(__dirname, 'dist/renderer/tinymce/tinymce.min.js'),
        },
        {
          from: path.resolve(__dirname, 'node_modules/tinymce/skins'),
          to: path.resolve(__dirname, 'dist/renderer/tinymce/skins'),
        },
        {
          from: path.resolve(__dirname, 'node_modules/tinymce/themes'),
          to: path.resolve(__dirname, 'dist/renderer/tinymce/themes'),
        },
        {
          from: path.resolve(__dirname, 'node_modules/tinymce/icons'),
          to: path.resolve(__dirname, 'dist/renderer/tinymce/icons'),
        },
        {
          from: path.resolve(__dirname, 'node_modules/tinymce/plugins'),
          to: path.resolve(__dirname, 'dist/renderer/tinymce/plugins'),
        },
        {
          from: path.resolve(__dirname, 'node_modules/tinymce/models'),
          to: path.resolve(__dirname, 'dist/renderer/tinymce/models'),
        },
        {
          // 中文语言包
          from: path.resolve(__dirname, 'src/renderer/assets/tinymce/langs'),
          to: path.resolve(__dirname, 'dist/renderer/tinymce/langs'),
        },
      ],
    }),
  ],
  devServer: {
    port: 3000,
    hot: true,
    static: [
      {
        directory: path.join(__dirname, 'dist/renderer'),
      },
      {
        // 在开发模式下直接从 node_modules 提供 TinyMCE 资源
        directory: path.join(__dirname, 'node_modules/tinymce'),
        publicPath: '/tinymce',
      },
      {
        // 中文语言包
        directory: path.join(__dirname, 'src/renderer/assets/tinymce/langs'),
        publicPath: '/tinymce/langs',
      },
    ],
  },
};
