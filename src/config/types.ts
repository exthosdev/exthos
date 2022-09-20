// TODO: mark optinal props with a  '?'
type EngineConfig = {
  http: {
    address: string;
    enabled: boolean;
    root_path: string;
    debug_endpoints: boolean;
    cert_file: string;
    key_file: string;
    cors: {
      enabled: boolean;
      allowed_origins: string[];
    };
  };
  logger: {
    level:
      | "FATAL"
      | "ERROR"
      | "WARN"
      | "INFO"
      | "DEBUG"
      | "TRACE"
      | "OFF"
      | "ALL"
      | "NONE";
    format: "json" | "logfmt";
    add_timestamp?: boolean;
    static_fields?: {
      "@pwrdby": "exthos";
    };
  };
  metrics:
    | {
        prometheus: {
          // TODO: add all props and make them optional
        };
        mapping: string;
      }
    | {
        json_api: {};
        mapping: string;
      }
    | {
        aws_cloudwatch: {
          a: 1;
        };
        mapping: string;
      }
    | {
        logger: {
          push_interval: string;
          flush_metrics: boolean;
        };
        mapping: string;
      };
  tracer:
    | {
        none: {};
      }
    | {
        jaeger: {
          aggent_address: string;
          collector_url: string;
          sampler_type: "const";
          flush_interval: string;
        };
      };
  shutdown_timeout: string;
};

type EngineExtraConfig = {
  isLocal: boolean;
  debugNamespace: string;
  handleProcessUncaughtException: boolean;
  handleProcessUnhandledRejection: boolean;
  benthosDir: string;
  benthosFileName: string;  // if provided overwrites: benthosVersion, benthosOS & benthosArch
  benthosVersion: `${number}.${number}.${number}`
  benthosOS: "linux" | "darwin" | "freebsd" | "openbsd" // windows not supported ?
  benthosArch: "amd64" | "arm64" | "armv6" | "armv7"
};

export { EngineConfig, EngineExtraConfig };
