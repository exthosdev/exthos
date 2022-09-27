import { TProcessor } from "./processors";

type TInputGenerate = {
  label?: string;
  generate: {
    mapping: string;
    interval?: string;
    count?: number;
  };
};

type TInputStdin = {
  label?: string;
  stdin: {
    codec?:
      | "auto"
      | "all-bytes"
      | `chunker:${string}`
      | "csv"
      | `csv:${string}`
      | `delim:${string}`
      | "gzip"
      | "lines"
      | "multipart"
      | "tar";
    max_buffer?: number;
  };
};

type TInputInPort = {
  label?: string;
  inport: {
    // codec?: "auto" | "all-bytes" | `chunker:${string}` | "csv" | `csv:${string}` | `delim:${string}` | "gzip" | "lines" | "multipart" | "tar",
    // max_buffer?: number
  };
};

type TInputFile = {
  label?: string;
  file: {
    paths: string[];
    codec?:
      | "auto"
      | "all-bytes"
      | `chunker:${string}`
      | "csv"
      | `csv:${string}`
      | `delim:${string}`
      | "gzip"
      | "lines"
      | "multipart"
      | "tar";
    max_buffer?: number;
    delete_on_finish?: boolean;
  };
};

type TInputRedisStreams = {
  label?: string;
  redis_streams: {
    url: string;
    kind?: "simple" | "cluster" | "failover";
    master?: string;
    tls?: {
      enabled?: boolean;
      skip_cert_verify?: boolean;
      enable_renegotiation?: boolean;
      root_cas?: string;
      root_cas_file?: string;
      client_certs?: {
        cert?: string;
        key?: string;
        cert_file?: string;
        key_file?: string;
        password?: string;
      }[];
    };
    body_key?: string;
    streams?: string[];
    limit?: number;
    client_id: string; // marking these compulsary
    consumer_group: string; // marking these compulsary
    create_streams?: boolean;
    start_from_oldest?: boolean;
    commit_period?: string;
    timeout?: string;
  };
};

type TInputBroker = {
  label?: string;
  broker: {
    copies?: number;
    inputs: TInput[];
    batching?: {
      count?: number;
      byte_size?: number;
      period?: string;
      check?: string;
      processors?: TProcessor[];
    };
  };
};

type TInputInproc = {
  label?: string;
  inproc: string;
};

type TInputDirect = {
  label?: "";
  direct: string;
};

type TInputNanomsg = {
  label?: "";
  nanomsg: {
    urls: string[];
    bind: boolean;
    socket_type: "PULL" | "SUB";
    sub_filters: string[];
    poll_timeout: string;
  };
};

type TInput = (
  | TInputGenerate
  | TInputStdin
  | TInputFile
  | TInputInPort
  | TInputRedisStreams
  | TInputBroker
  | TInputInproc
  | TInputDirect
  | TInputNanomsg
) & { processors?: TProcessor[] };

export { TInput, TInputBroker };
