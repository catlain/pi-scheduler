import { createConfig } from "../vitest.config.base";

export default createConfig({
	alias: {
		"@earendil-works/pi-coding-agent": true,
		"@earendil-works/pi-tui": true,
	},
	fileParallelism: false,
});
