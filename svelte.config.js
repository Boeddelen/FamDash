import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in Svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// The output directory is overridable so the e2e run can build somewhere else.
		// It must: the live service runs from ./build, and rebuilding into it under a
		// running process tears the module graph out from under Node — the service then
		// 500s until launchd restarts it onto whatever half-written build is there,
		// silently deploying unreviewed code. That has happened more than once.
		adapter: adapter({ out: process.env.BUILD_OUT || 'build' }),
		// adapter-node assumes https when no proxy header is set, which breaks the
		// built-in Origin check for a plain-http LAN app reached by several
		// hostnames (localhost, the Mac's name, its LAN IP). We turn the built-in
		// check off and enforce a scheme-agnostic same-host check in hooks.server.ts.
		csrf: { trustedOrigins: ['*'] }
	}
};

export default config;
