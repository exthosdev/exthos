import { TProcessor } from "./processors"

type TOutputFile = {
    label?: string,
    file: {
        path: string,
        codec?: "all-bytes" | "append" | "lines" | `delim:${string}`
    }
}

type TOutputStdout = {
    label?: ""
    stdout: {
        codec?: "all-bytes" | "append" | "lines" | `delim:${string}`
    }
}

type TOutputOutport = {
    label?: ""
    outport: {
        codec?: "all-bytes" | "append" | "lines" | `delim:${string}`
    }
}

type TOutputHttpClient = {
    label?: ""
    http_client: {
        url: string,
        verb: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "CONNECT" | "OPTIONS" | "TRACE" | "PATCH"
        headers?: {}
        metadata?: {
            include_prefixes: []
            include_patterns: []
        },
        oauth?: {
            enabled: boolean
            consumer_key: string
            consumer_secret: string
            access_token: string
            access_token_secret: string
        },
        oauth2?: {
            enabled: boolean
            client_key: string
            client_secret: string
            token_url: string
            scopes?: string[]
        },
        jwt?: {
            enabled: boolean,
            private_key_file: string
            signing_method: string
            claims: {}
            headers: {}
        },
        basic_auth?: {
            enabled: boolean
            username: string
            password: string
        },
        tls?: {
            enabled: boolean
            skip_cert_verify: boolean
            enable_renegotiation: boolean
            root_cas: string
            root_cas_file: string
            client_certs: { cert?: string, key?: string, cert_file?: string, key_file?: string, password?: string }[]
        },
        extract_headers?: {
            include_prefixes: []
            include_patterns: []
        },
        rate_limit?: string,
        timeout?: string,
        retry_period?: string,
        max_retry_backoff?: string,
        retries?: 3,
        backoff_on?: number[],
        drop_on?: number[],
        successful_on?: number[],
        proxy_url?: string,
        batch_as_multipart?: boolean,
        propagate_response?: boolean,
        max_in_flight?: number,
        batching?: {
            count?: number,
            byte_size?: number,
            period?: string,
            check?: string,
            processors?: TProcessor[]
        }
        multipart?: { content_type: string, content_disposition: string, body: string }[]
    }
}

type TOutputAzureBlobStorage = {
    label?: ""
    azure_blob_storage: {
        storage_account: string
        storage_access_key?: string
        storage_sas_token?: string
        storage_connection_string?: string
        public_access_level?: "PRIVATE" | "BLOB" | "CONTAINER"
        container: string
        path?: string
        blob_type?: "BLOCK" | "APPEND"
        max_in_flight?: number
    }
}

type TOutputBroker = {
    label?: string
    broker: {
        copies?: number
        pattern?: "fan_out" | "fan_out_sequential" | "round_robin" | "greedy"
        outputs: TOutput[]
        batching?: {
            count?: number
            byte_size?: number
            period?: string
            check?: string
            processors?: TProcessor[]
        }
    }
}

type TOutputInproc = {
    label?: string
    inproc: string
}

type TOutputDirect = {
    label?: ""
    direct: string
}

type TOutput = (TOutputFile | TOutputStdout | TOutputOutport | TOutputHttpClient | TOutputAzureBlobStorage | TOutputBroker | TOutputInproc | TOutputDirect) & { processors?: TProcessor[] }

export { TOutput, TOutputBroker }