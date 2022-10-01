# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## v0.2.3

- feat: option to keepAlive engine added. defaults to true (closes #23)
- fix: config via environment is taken care for boolean and number conversions
- feat: shutdownAfterInactivityFor is part of extraEngineConfig now
- fix: integration tests so they don't run infinitely

## v0.2.2

- feat: using prettier for source code
- o: stream.ts refactored for testability
- o: converted some methods to static in Stream
- o: converted all fs calls to promises instead of sync
- fix: integration tests werent failing when they should
- feat: useDefaultEventHanlder now accepts clients to provide optional custom events as params. this is used in integration test
- o: modified all examples
- o: converted some method to static in Engine
- o: minor edits to README
- o: added "all-bytes" codes to file output example so that the file in testdata folder doesn't explode
- feat: implemented config mgmt for exthos
- fix: some issues with config management
- o: update README for config mgmt
- fix: if new Engine is created with { metrics: { json_api: {} }, logger: { add_timestamp: "xxx" } }, proper error is not logged
- o: implement afterRemove method for Stream class
- fix: to be able to use existing benthos exe
- feat: now additionally checking that benthos min version is used
- feat: print the benthos version being used on startup. test on REPL: "import("execa").then(execa => {console.log(execa.execaCommandSync(benthos -v)).stdout})"
- feat: exposing Engine and Stream classes in default export as well
- fix: axios errors are now handled for circ ref errors beforing getting passed to formatErrorForEvent

## v0.2.1

- fix: namespacing and updated README
- feat: `via` component for `route` #16
- updated README with clear explanation for debug logs
- update README with `installation` instructions
- added a logo to README
- o: using merge in stream.ts now
- o: improved the way defaults are applied to input, output, processors etc.
- fix: branch processor properties request_map and result_map made optional
- fix: replaceKeys and replaceValueForKey utils
- fix: labels are now sanitized as part of stream creation
- feat: added supports-color for more color support if available
- fix: engine config file is written only once, when the engine is started
- fix: engine config merging and updation
- feat: config files are not cleanedup from tmp
- o: tidied up the engine constructor
- fix: fix the issue where engineConfig and engineOpts updates were undergoing race conditions due to the engine creation in hlapi.index file
- o: introduced an example for remote run hlapi
- fix: events that contain "error" now return an error property of Error type
- o: renamed events
- o: updated README's events section
- fix: try catch in all of engine.ts
- fix: traceLog for all engine methods
- o: updated README to show isLocal and that events are also logged
- o: include project status, acknowledgments  and Compatability & Support sections in README
- o: stream standalone mode has been removed
- fix: error in sanitize stream config due to undefined label property set in JS processor
- fix: engine config metrics and tracer are not merged but replaced now
- fix: engine now catches uncaughtexceptions
- fix: engine now also catches unhandledRejection
- fix: engine remove all streams was not working when .stop() was reached before .add() completed
