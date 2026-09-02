# Contributing

This guide provides instructions for contributing to this Capacitor plugin.

## Developing

### Local Setup

1. Fork and clone the repo.
1. Install the dependencies.

   ```shell
   npm install
   ```

1. Install SwiftLint if you're on macOS.

   ```shell
   brew install swiftlint
   ```

### Scripts

#### `npm run build`

Build the plugin web assets and generate plugin API documentation using [`@rdlabo/capacitor-docgen`](https://github.com/rdlabo-team/capacitor-docgen).

It will compile the TypeScript code from `src/` into ESM JavaScript in `dist/esm/`. These files are used in apps with bundlers when your plugin is imported.

Then, Rollup will bundle the code into a single file at `dist/plugin.js`. This file is used in apps without bundlers by including it as a script in `index.html`.

#### `npm run verify`

Build and validate the web and native projects.

This is useful to run in CI to verify that the plugin builds for all platforms.

#### `npm run lint` / `npm run fmt`

Check formatting and code quality, autoformat/autofix if possible.

This template is integrated with ESLint, Prettier, and SwiftLint. Using these tools is completely optional, but the [Capacitor Community](https://github.com/capacitor-community/) strives to have consistent code style and structure for easier cooperation.

## Publishing

Maintainers create stable and prerelease tags with:

```shell
npm run release
```

The tag triggers npm Trusted Publishing through GitHub Actions; do not publish directly or add an `NPM_TOKEN` repository secret. Beta releases are available through the gated `/beta` flow. See the [release guide](docs/releasing.md) for setup, channels, and the one-time bootstrap required for a new npm package name.
