[![License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](./LICENSE)

## Building & Running

### Build:
    npm install
    npm run build

### Build automatically on file save:
    npm run watch

### Build with debug mode enabled:
    DEBUG=molstar npm run watch

### Build for production:
    npm run build

**Run**

If not installed previously:

    npm install -g http-server

...or a similar solution.

From the root of the project:

    http-server -p PORT-NUMBER

and navigate to `build/dist/viewer/`

## Prerelease
    npm version prerelease # assumes the current version ends with '-dev.X'
    npm publish --tag next

## Release
    npm version 1.X.0 # provide valid semver string
    npm publish