Changelog
=========

All notable changes to this project will be documented in this file.

## v1.1.0
  - feat+fix: inport and outport now use nanomsg on unix socket. #4
  - fix: all examples. #3
  - feat: moved defaulteventhandler inside engine. engine now exposes a `useDefaultEventHandler` method
  - o: removed log_level
  - o: worked on README.md #1

## v1.0.10
- fix: tar into /tmp folder to fix github tests

## v1.0.9 
- feat: benthos exe is downloaded if not present

## v1.0.7 - v1.0.8
- feat: included the first working test with jest
- feat: debugging within engine enhanced
- feat: jest test fixes
- feat: more tests

## v1.0.6 
- feat: introduced direct component, fixed some issues, took care of some TODO items

## v1.0.5
- feat: introduced TJavascript, laid foundation for hlapis, created a first set of hlapis
- feat: TJavascript: is used to run js on events. The key points are:
  - feat: A msg obj is available such that
      - msg.content refers to the raw content of the event
      - msg.meta refer to the metadata for the event
  - console and process object are not available within the js

## v1.0.4 
- feat: increased strictness in tsconfig. new tsconfig altogether 
- feat: add ability to gracefully shutdown on SIGINT. code cleanup