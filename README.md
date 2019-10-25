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

and navigate to `build/dist/structure-viewer/`

## Publish

The publish will send the package to our own registry at http://nexus3.rcsb.org/repository/npm-rcsb/ (not to NPM as this is currently a private project).

## Prerelease
    npm version prerelease # asumes the current version ends with '-dev.X'
    npm publish --tag next

## Release
    npm version 0.X.0 # provide valid semver string
    npm publish