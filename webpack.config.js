const path = require("path");

module.exports = {
	//mode: "development",
	mode: "production",
	target: "node",
	entry: {
		app: "./src/Index.ts",
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: path.resolve(__dirname, "node_modules"),
			},
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js", ".json"],
	},
	output: {
		filename: "app.js",
		path: path.resolve(__dirname, "build"),
	},
	externals: {
		fsevents: "require('fsevents')",
		electron: "require('electron')",
	},
	watch: true,
	watchOptions: {
		aggregateTimeout: 200,
		poll: 1000,
		ignored: /node_modules/,
	},
};
