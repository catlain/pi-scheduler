import { createConfig } from "../vitest.config.base";

export default createConfig({
	alias: {
		"@earendil-works/pi-coding-agent": true,
		"@earendil-works/pi-tui": "/home/lain/.local/share/fnm/node-versions/v22.22.2/installation/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-tui/dist/index.js",
	},
	test: {
		fileParallelism: false,
	},
});
