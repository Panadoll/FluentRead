import {services} from "../utils/option";
import microsoft from "./microsoft";
import google from "./google";
import custom from "./custom";

type ServiceFunction = (message: any) => Promise<any>;
type ServiceMap = {[key: string]: ServiceFunction;};

export const _service: ServiceMap = {
    [services.microsoft]: microsoft,
    [services.google]: google,
    [services.custom]: custom,
}
