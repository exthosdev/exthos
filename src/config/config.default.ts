import { EngineConfig, EngineExtraConfig } from "./types.js";

/**
 * defines the default config values used by exthos
 * to overwrite defaults, provide one of the two:
 * - a file named config.js in your project root
 * - or env variables that the form EXTHOS_* e.g. EXTHOS_benthosFileName=abcd
 *
 * Precedence: defaults < ./config.js < EXTHOS_* env vars
 *
 * `config.refresh` can be used anytime to refresh the configuration
 */

let config: {
  engineExtraConfig: EngineExtraConfig;
  engineConfig: EngineConfig;
} = {
  engineExtraConfig: {
    isLocal: true,
    debugNamespace: "",
    handleProcessUncaughtException: true,
    handleProcessUnhandledRejection: true,
    benthosDir: "/tmp",
    benthosFileName: "", // if benthosFileName is provided following are not used: benthosVersion, benthosOS & benthosArch
    benthosVersion: "4.5.1",
    benthosOS: "linux",
    benthosArch: "amd64",
  },
  engineConfig: {
    http: {
      address: "0.0.0.0:4195",
      enabled: true,
      root_path: "/exthos",
      debug_endpoints: false,
      cert_file: "",
      key_file: "",
      cors: {
        enabled: false,
        allowed_origins: [],
      },
    },
    logger: {
      level: "INFO",
      format: "json",
      add_timestamp: true,
      static_fields: {
        "@pwrdby": "exthos",
      },
    },
    metrics: {
      prometheus: {},
      mapping: "",
    },
    tracer: {
      none: {},
    },
    shutdown_timeout: "20s",
  },
};

export default config;
