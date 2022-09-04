# High level APIs (hlapis)

The idea of hlapis (high level apis) is to abstract away the complexities of configuring the stream.
hlapis are highly aspired from the Apache Camel DSL.

A minimilistic example follows:

```js
// optinally set engine configuration using:
engine.config;

// use the routes APIs
let route = from().to().start();
setTimeout(() => {
  route.stop();
}, 5000); // stop the route after 5 secs

// other route examples
from().via().to().start();
from().batchAtInput().via().batchAtOutput().to().start();
```
