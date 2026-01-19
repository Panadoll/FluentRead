import {commonMsgTemplate} from "../utils/template";
import {method} from "../utils/constant";
import {services} from "@/entrypoints/utils/option";
import {config} from "@/entrypoints/utils/config";
import {contentPostHandler} from "@/entrypoints/utils/check";

async function custom(message: any) {

    let headers = new Headers();
    headers.append('Content-Type', 'application/json');
    const token = message?.__fr?.token ?? config.token[services.custom];
    if (token) headers.append('Authorization', `Bearer ${token}`);

    const requestBody = commonMsgTemplate(message.origin);
    
    // 调试日志：在开发模式下输出请求详情
    if (process.env.NODE_ENV === 'development') {
        console.log('[FluentRead] Ollama 请求详情:', {
            url: config.custom,
            body: requestBody,
            parsedBody: JSON.parse(requestBody)
        });
    }

    const resp = await fetch(config.custom, {
        method: method.POST,
        headers: headers,
        body: requestBody
    });

    if (resp.ok) {
        let result = await resp.json();
        return  contentPostHandler(result.choices[0].message.content);
    } else {
        console.log("翻译失败：", resp);
        throw new Error(`翻译失败: ${resp.status} ${resp.statusText} body: ${await resp.text()}`);
    }
}

export default custom;