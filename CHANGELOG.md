Changelog
=========

All notable changes to this project will be documented in this file.

## Unreleased

### Added

### Fixed

## v1.0.6 

### Added

- introduced direct component, fixed some issues, took care of some TODO items

## v1.0.5

### Added

- introduced TJavascript, laid foundation for hlapis, created a first set of hlapis
- TJavascript: is used to run js on events. The key points are:
  - A msg obj is available such that
    - msg.content refers to the raw content of the event
    - msg.meta refer to the metadata for the event
  - console and process object are not available within the js

## v1.0.4 

### Added

- increased strictness in tsconfig. new tsconfig altogether 
- add ability to gracefully shutdown on SIGINT. code cleanup