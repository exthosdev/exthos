import { TOutput } from "../types/outputs.js";

const defaultOutputValues: TOutput = {
  //TOutputStdout | TOutputFile | TOutputHttpClient | TOutputAzureBlobStorage = {
  label: "",
  stdout: {
    codec: "lines",
  },

  file: {
    path: "",
    codec: "lines",
  },

  http_client: {
    url: "",
    verb: "POST",
    headers: {},
    metadata: {
      include_prefixes: [],
      include_patterns: [],
    },
    oauth: {
      enabled: false,
      consumer_key: "",
      consumer_secret: "",
      access_token: "",
      access_token_secret: "",
    },
    oauth2: {
      enabled: false,
      client_key: "",
      client_secret: "",
      token_url: "",
      scopes: [],
    },
    jwt: {
      enabled: false,
      private_key_file: "",
      signing_method: "",
      claims: {},
      headers: {},
    },
    basic_auth: {
      enabled: false,
      username: "",
      password: "",
    },
    tls: {
      enabled: false,
      skip_cert_verify: false,
      enable_renegotiation: false,
      root_cas: "",
      root_cas_file: "",
      client_certs: [],
    },
    extract_headers: {
      include_prefixes: [],
      include_patterns: [],
    },
    rate_limit: "",
    timeout: "5s",
    retry_period: "1s",
    max_retry_backoff: "300s",
    retries: 3,
    backoff_on: [429],
    drop_on: [],
    successful_on: [],
    proxy_url: "",
    batch_as_multipart: false,
    propagate_response: false,
    max_in_flight: 64,
    batching: {
      count: 0,
      byte_size: 0,
      period: "",
      check: "",
      processors: [],
    },
    multipart: [],
  },

  azure_blob_storage: {
    storage_account: "",
    storage_access_key: "",
    storage_sas_token: "",
    storage_connection_string: "",
    public_access_level: "PRIVATE",
    container: "",
    path: '${!count("files")}-${!timestamp_unix_nano()}.txt',
    blob_type: "BLOCK",
    max_in_flight: 64,
  },

  broker: {
    copies: 1,
    pattern: "fan_out",
    outputs: [],
    batching: {
      count: 0,
      byte_size: 0,
      period: "",
      check: "",
      processors: [],
    },
  },

  inproc: "",

  nanomsg: {
    urls: [],
    bind: false,
    socket_type: "PUSH",
    poll_timeout: "5s",
    max_in_flight: 64,
  },
};
export { defaultOutputValues };
