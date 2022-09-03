# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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