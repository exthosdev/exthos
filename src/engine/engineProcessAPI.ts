import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios"
import EventEmitter2 from "eventemitter2"
import { Stream } from "../stream/stream.js"
import { standardizeAxiosErrors } from "../utils/utils.js"
import { Mutex } from 'async-mutex';
import { TStreamConfig } from "../types/streamConfig.js";

abstract class EngineProcessAPI extends EventEmitter2 { // EventEmitter.EventEmitter {

    protected _axiosInstance!: AxiosInstance
    private _engineProcessMutex = new Mutex()

    constructor() {
        super({ wildcard: true })
    }

    protected async _apiGetStreams(axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<{
        [streamID: string]: {
            "active": boolean
            "uptime": BigInt
            "uptime_str": string
        }
    }>> {
        let self = this
        try {
            let resp = await self._axiosInstance.get("/streams", axiosReqConfig)
            return resp
        } catch (e: any) {
            throw standardizeAxiosErrors(e)
        }
    }

    protected async _apiGetPing(axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<string>> {
        let self = this
        try {
            let resp = await self._axiosInstance.get("/ping", axiosReqConfig)
            return resp
        } catch (e: any) {
            throw standardizeAxiosErrors(e)
        }
    }

    protected async _apiGetReady(axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<string>> {
        let self = this
        try {
            let resp = await self._axiosInstance.get("/ready", axiosReqConfig)
            return resp
        } catch (e: any) {
            throw standardizeAxiosErrors(e)
        }
    }

    protected async _apiGetStreamReady(stream: Stream, axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<string>> {
        let self = this
        try {
            let resp = await self._axiosInstance.get(`/${stream.streamID}/ready`, axiosReqConfig)
            return resp
        } catch (e: any) {
            throw standardizeAxiosErrors(e)
        }
    }

    protected async _apiPostStreams(streamsMap: { [key: string]: Stream }, axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<string>> {
        // using mutex here otherwise /streams api returns weird error saying "failed to update stream: stream does not exist\nfailed to create stream: stream already exists\n"
        let self = this
        return await self._engineProcessMutex.runExclusive(async () => {
            try {
                let streamsConfig: { [key: string]: TStreamConfig } = {}
                for (let k in streamsMap) {
                    streamsConfig[k] = streamsMap[k].streamConfig
                }
                let resp = await self._axiosInstance.post("/streams", streamsConfig, axiosReqConfig)
                return resp

            } catch (e: any) {
                throw standardizeAxiosErrors(e)
            }
        })
    }

    protected async _apiGetStream(stream: Stream, axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<{
        "active": boolean
        "uptime": number //"<float, uptime in seconds>",
        "uptime_str": string //"<string, human readable string of uptime>",
        "config": TStreamConfig //"<object, the configuration of the stream>"
    }>> {
        let self = this
        try {
            let resp = await self._axiosInstance.get(`/streams/${stream.streamID}`, axiosReqConfig)
            return resp
        } catch (e: any) {
            throw standardizeAxiosErrors(e)
        }
    }

    protected async _apiPostStream(stream: Stream, axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<string>> {
        // using mutex here otherwise /streams api returns weird error saying "failed to update stream: stream does not exist\nfailed to create stream: stream already exists\n"
        let self = this
        return await self._engineProcessMutex.runExclusive(async () => {
            try {
                let resp = await self._axiosInstance.post(`/streams/${stream.streamID}`, stream.streamConfig, axiosReqConfig)
                return resp
            } catch (e: any) {
                throw standardizeAxiosErrors(e)
            }
        })
    }

    protected async _apiDeleteStream(stream: Stream, axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<string>> {
        // using mutex here otherwise /streams api returns weird error saying "failed to update stream: stream does not exist\nfailed to create stream: stream already exists\n"
        let self = this
        return await self._engineProcessMutex.runExclusive(async () => {
            try {
                let resp = await self._axiosInstance.delete(`/streams/${stream.streamID}`, axiosReqConfig)
                return resp
            } catch (e: any) {
                throw standardizeAxiosErrors(e)
            }
        })
    }
    protected async _apiPutStream(stream: Stream, axiosReqConfig: AxiosRequestConfig = {}): Promise<AxiosResponse<string>> {
        // using mutex here otherwise /streams api returns weird error saying "failed to update stream: stream does not exist\nfailed to create stream: stream already exists\n"
        let self = this
        return await self._engineProcessMutex.runExclusive(async () => {
            try {
                let resp = await self._axiosInstance.put(`/streams/${stream.streamID}`, stream.streamConfig, axiosReqConfig)
                return resp
            } catch (e: any) {
                throw standardizeAxiosErrors(e)
            }
        })
    }
}

export { EngineProcessAPI }