<template>
  <el-row class="margin-bottom margin-left-2em">
    <el-col :span="20" class="lightblue rounded-corner">
      <span class="popup-text popup-vertical-left">插件状态</span>
    </el-col>
    <el-col :span="4" class="flex-end">
      <el-switch v-model="config.on" inline-prompt active-text="开" inactive-text="关" />
    </el-col>
  </el-row>

  <div v-if="!config.on">
    <el-empty description="插件处于禁用状态" />
  </div>

  <div v-show="config.on">
    <el-row class="margin-bottom margin-left-2em">
      <el-col :span="12" class="lightblue rounded-corner">
        <span class="popup-text popup-vertical-left">站点黑名单</span>
      </el-col>
      <el-col :span="12" class="flex-end">
        <el-button size="small" @click="addCurrentSiteToBlacklist" :disabled="!currentMainDomain || isCurrentSiteBlocked">
          加入黑名单
        </el-button>
        <el-button size="small" @click="removeCurrentSiteFromBlacklist" :disabled="!currentMainDomain || !isCurrentSiteBlocked">
          移除
        </el-button>
      </el-col>
    </el-row>

    <el-row class="margin-bottom margin-left-2em">
      <el-col :span="12" class="lightblue rounded-corner">
        <span class="popup-text popup-vertical-left">翻译服务</span>
      </el-col>
      <el-col :span="12">
        <el-select v-model="config.service" placeholder="请选择翻译服务">
          <el-option class="select-left" v-for="item in options.services" :key="item.value" :label="item.label"
            :value="item.value" />
        </el-select>
      </el-col>
    </el-row>

    <el-row class="margin-bottom margin-left-2em">
      <el-col :span="12" class="lightblue rounded-corner">
        <span class="popup-text popup-vertical-left">目标语言</span>
      </el-col>
      <el-col :span="12">
        <el-select v-model="config.to" placeholder="请选择目标语言">
          <el-option class="select-left" v-for="item in options.to" :key="item.value" :label="item.label"
            :value="item.value" />
        </el-select>
      </el-col>
    </el-row>

    <el-row v-show="showModel" class="margin-bottom margin-left-2em">
      <el-col :span="12" class="lightblue rounded-corner">
        <span class="popup-text popup-vertical-left">模型</span>
      </el-col>
      <el-col :span="12">
        <el-select v-model="config.model[config.service]" placeholder="请选择模型">
          <el-option v-for="item in modelOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </el-col>
    </el-row>

    <el-row v-show="showCustomModel" class="margin-bottom margin-left-2em">
      <el-col :span="12" class="lightblue rounded-corner">
        <span class="popup-text popup-vertical-left">自定义模型</span>
      </el-col>
      <el-col :span="12">
        <el-input v-model="config.customModel[config.service]" placeholder="输入模型名称" />
      </el-col>
    </el-row>

    <el-row v-show="showCustomUrl" class="margin-bottom margin-left-2em">
      <el-col :span="12" class="lightblue rounded-corner">
        <span class="popup-text popup-vertical-left">服务地址</span>
      </el-col>
      <el-col :span="12">
        <el-input v-model="config.custom" placeholder="http://localhost:11434/v1/chat/completions" />
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { models, options, servicesType, customModelString } from "../entrypoints/utils/option";
import { Config } from "@/entrypoints/utils/model";
import { storage } from '@wxt-dev/storage';
import { ElMessage } from 'element-plus'
import browser from 'webextension-polyfill';

let config = ref(new Config());
const currentMainDomain = ref('');
const isCurrentSiteBlocked = computed(() => config.value.blockedMainDomains?.includes(currentMainDomain.value));

const showModel = computed(() => servicesType.isUseModel(config.value.service));
const showCustomModel = computed(() =>
  servicesType.isUseModel(config.value.service) &&
  config.value.model[config.value.service] === customModelString
);
const showCustomUrl = computed(() => servicesType.isUseCustomUrl(config.value.service));
const modelOptions = computed(() => models.get(config.value.service) || []);

function getMainDomainFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const noProtocol = url.replace(/^(https?:\/\/)/, '');
    const hostname = noProtocol.split('/')[0].replace(/^www\./, '');
    const parts = hostname.split('.');
    if (parts.length >= 3 &&
        ((parts[parts.length - 2] === 'co' || parts[parts.length - 2] === 'com') &&
        parts[parts.length - 1].length === 2)) {
      return parts.slice(-3).join('.');
    }
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return hostname;
  } catch (error) {
    console.error('getMainDomainFromUrl error:', error);
    return '';
  }
}

function ensureBlockedList() {
  if (!Array.isArray(config.value.blockedMainDomains)) {
    config.value.blockedMainDomains = [];
  }
}

async function refreshCurrentMainDomain() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  currentMainDomain.value = getMainDomainFromUrl(tab?.url);
}

storage.getItem('local:config').then((value: any) => {
  if (typeof value === 'string' && value) {
    const parsedConfig = JSON.parse(value);
    Object.assign(config.value, parsedConfig);
  }
  ensureBlockedList();
  refreshCurrentMainDomain();
});

storage.watch('local:config', (newValue: any) => {
  if (typeof newValue === 'string' && newValue) {
    Object.assign(config.value, JSON.parse(newValue));
  }
  ensureBlockedList();
});

watch(config, (newValue: any) => {
  storage.setItem('local:config', JSON.stringify(newValue));
}, { deep: true });

async function addCurrentSiteToBlacklist() {
  ensureBlockedList();
  if (!currentMainDomain.value) return;
  config.value.blockedMainDomains = Array.from(new Set([
    ...config.value.blockedMainDomains,
    currentMainDomain.value
  ]));
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, {
      type: 'contextMenuTranslate',
      action: 'restore'
    }).catch(() => {
      // 忽略发送失败
    });
  }
  ElMessage({ message: '已加入黑名单', type: 'success', duration: 1500 });
}

async function removeCurrentSiteFromBlacklist() {
  ensureBlockedList();
  if (!currentMainDomain.value) return;
  config.value.blockedMainDomains = config.value.blockedMainDomains.filter(
    (item: string) => item !== currentMainDomain.value
  );
  ElMessage({ message: '已从黑名单移除', type: 'success', duration: 1500 });
}
</script>
