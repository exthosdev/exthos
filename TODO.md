
Todo:
- implement stopAfter hlapi (see README)
- take a look at defaults. are they even working? see sanitized stream config debug output
- remove log_level.js
- some events like engine.remove.stream, engine.active do not contain important keys like `"time":"2022-08-11T16:23:43+10:00", "@pwrdby":"exthos", "level":"???"`
- mark private class elements with #, like we did in stream.ts
- expose metrics
- processors inside input is failing with error:  Object.keys(defaultInputValues[ipo]).forEach(k => {
                                                    TypeError: Cannot convert undefined or null to object
- ability to hide **** any credentials
- how to send data to a stream running on the engine? idea: use tcp for comms (createConnection and createServer). replace stdin/out with tcp as well for standalone?
- autoinstall benthos if doesnt 
- give default labels to components if not provided by client-user. are labels shown in metrics?


Completed:
- get rid of logger in stream.ts
- introduce direct component
- javascript processor tested on a batch  - works on each msg as expected
- ctr-c shoud be sent to childProcess so it can end gracefully, infact even abort signal should be a ctr-c
- wrong pwd for redis causes input error but it keep trying forever. use /read and delete that stream
  - use the endpoint such as : `localhost:4195/877f3d83-980d-42f7-a60b-fa0930b48728/ready` to periodically check for streams with error related to inputs and outputs [IDEA: extend cleanup method?]
- Q. when should engine throw? should we send an event while logging so client can decide what to do when error occurs
    - Ans: exthos never throws except when creation of Engine of Stream instances, clients should use the varios events for performing actions
- add redis_streams input and test
- adopt Readiness patern using promises
- implemented auto cleanup and shutdown for the engine
- create simple logging util: should be an event emitter? this.logger should be public? so clients can hook up events into their own logger?
    - implemented logger using debug module
- Engine() class needs to be created
- new Stream() should not autostart, while also making StreamConf as a public variable
- amend other examples to comply with new simplified api
- allow pipe method
- introduce `outport`
- simplified api further: no start method now
- introduce `inport` to send data to underlying childProcess
- simplified api