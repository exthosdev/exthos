type TNoop = {
  label?: string;
  noop: {};
};

type TBloblang = {
  label?: string;
  bloblang: string;
};

type TArchive = {
  label?: string;
  archive: {
    format: "binary" | "concatenate" | "json_array" | "lines" | "tar" | "zip";
    path?: string;
  };
};

type TLog = {
  label?: string;
  log: {
    level?: "FATAL" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE" | "ALL";
    fields_mapping?: string;
    message?: string;
  };
};

type TSubprocess = {
  label?: string;
  subprocess: {
    name: string;
    args: string[];
    max_buffer: number;
    codec_send: "lines" | "length_prefixed_uint32_be" | "netstring";
    codec_recv: "lines" | "length_prefixed_uint32_be" | "netstring";
  };
};

type TJavascript = {
  label?: string;
  javascript: string;
};

type TBranch = {
  label?: string;
  branch: {
    request_map?: string;
    processors: TProcessor[];
    result_map?: string;
  };
};

type TProcessor =
  | TNoop
  | TBloblang
  | TArchive
  | TLog
  | TSubprocess
  | TJavascript
  | TBranch;

export { TProcessor };
