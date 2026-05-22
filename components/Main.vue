<template>
  <!-- 卡片一：服务运行状态 -->
  <div class="fr-card">
    <div class="fr-card-title">
      <el-icon><Setting /></el-icon>
      运行状态与规则
    </div>
    
    <div class="fr-option-row">
      <div class="fr-option-info">
        <span class="fr-option-label">启用翻译插件</span>
        <span class="fr-option-desc">开启后开始自动翻译页面内容</span>
      </div>
      <el-switch v-model="config.on" inline-prompt active-text="开" inactive-text="关" />
    </div>

    <div v-show="config.on" class="fr-option-row" style="margin-top: 12px; border-top: 1px dashed var(--fr-border-color-lighter); padding-top: 12px; margin-bottom: 12px;">
      <div class="fr-option-info">
        <span class="fr-option-label">自动翻译范围</span>
        <span class="fr-option-desc">智能检测外语网页，或仅在“总是翻译”站点自动翻译</span>
      </div>
      <el-select v-model="config.autoTranslateMode" size="small" style="width: 110px;">
        <el-option label="智能检测" value="smart" />
        <el-option label="检测白名单" value="whitelist" />
      </el-select>
    </div>

    <!-- 当插件开启时，才展示站点规则配置 -->
    <div v-show="config.on" class="blacklist-section">
      <div class="blacklist-header">
        <span class="fr-form-label">站点个性化规则</span>
      </div>
      <div class="current-site-box">
        <div class="site-info">
          <span class="site-label">当前站点：</span>
          <span class="site-domain">{{ currentMainDomain || '（未获取到当前站点）' }}</span>
          <span v-if="currentMainDomain" class="site-status" :class="statusClass">
            {{ statusText }}
          </span>
        </div>
        <div class="site-actions" v-if="currentMainDomain">
          <!-- 智能检测(smart) 模式下的三个按钮 -->
          <template v-if="config.autoTranslateMode === 'smart'">
            <el-button 
              size="small" 
              type="success"
              plain
              @click="setSiteAlwaysTranslate" 
              :disabled="isCurrentSiteAllowed"
            >
              总是翻译
            </el-button>
            <el-button 
              size="small" 
              type="danger"
              plain
              @click="setSiteNeverTranslate" 
              :disabled="isCurrentSiteBlocked"
            >
              从不翻译
            </el-button>
            <el-button 
              size="small" 
              type="info"
              plain
              @click="resetSiteRule" 
              :disabled="!isCurrentSiteAllowed && !isCurrentSiteBlocked"
            >
              智能检测
            </el-button>
          </template>

          <!-- 检测白名单(whitelist) 模式下的两个按钮 -->
          <template v-else>
            <el-button 
              size="small" 
              type="success"
              plain
              @click="setSiteAlwaysTranslate" 
              :disabled="isCurrentSiteAllowed"
            >
              开启自动翻译
            </el-button>
            <el-button 
              size="small" 
              type="info"
              plain
              @click="resetSiteRule" 
              :disabled="!isCurrentSiteAllowed"
            >
              默认不翻译
            </el-button>
          </template>
        </div>
      </div>

      <!-- 白名单域名列表 -->
      <div v-if="config.allowedMainDomains?.length" class="blocked-tags-area" style="margin-bottom: 12px;">
        <span class="sub-label">
          {{ config.autoTranslateMode === 'whitelist' ? '已启用智能检测的站点（白名单）：' : '总是自动翻译的站点（白名单）：' }}
        </span>
        <div class="tags-container">
          <el-tag
            v-for="domain in config.allowedMainDomains"
            :key="domain"
            size="small"
            closable
            type="success"
            class="domain-tag"
            @close="removeAllowedDomain(domain)"
          >
            {{ domain }}
          </el-tag>
        </div>
      </div>

      <!-- 黑名单域名列表：仅在智能检测(smart)模式下展示 -->
      <div v-if="config.autoTranslateMode === 'smart' && config.blockedMainDomains?.length" class="blocked-tags-area">
        <span class="sub-label">从不自动翻译的站点（黑名单）：</span>
        <div class="tags-container">
          <el-tag
            v-for="domain in config.blockedMainDomains"
            :key="domain"
            size="small"
            closable
            type="danger"
            class="domain-tag"
            @close="removeBlockedDomain(domain)"
          >
            {{ domain }}
          </el-tag>
        </div>
      </div>
    </div>
  </div>

  <div v-if="!config.on" class="disabled-state-empty">
    <el-empty description="插件处于禁用状态" :image-size="80" />
  </div>

  <!-- 卡片二：翻译服务配置 -->
  <div v-show="config.on" class="fr-card">
    <div class="fr-card-title">
      <el-icon><ChatDotRound /></el-icon>
      翻译引擎配置
    </div>

    <div class="fr-form-group">
      <span class="fr-form-label">翻译服务</span>
      <el-select v-model="config.service" placeholder="请选择翻译服务" style="width: 100%">
        <el-option class="select-left" v-for="item in options.services" :key="item.value" :label="item.label"
          :value="item.value" />
      </el-select>
    </div>

    <div class="fr-form-group">
      <span class="fr-form-label">目标语言</span>
      <el-select v-model="config.to" placeholder="请选择目标语言" style="width: 100%">
        <el-option class="select-left" v-for="item in options.to" :key="item.value" :label="item.label"
          :value="item.value" />
      </el-select>
    </div>

    <div v-show="showModel" class="fr-form-group">
      <span class="fr-form-label">模型类型</span>
      <el-select v-model="config.model[config.service]" placeholder="请选择模型" style="width: 100%">
        <el-option v-for="item in modelOptions" :key="item" :label="item" :value="item" />
      </el-select>
    </div>

    <div v-show="showCustomModel" class="fr-form-group">
      <span class="fr-form-label">自定义模型名称</span>
      <el-input v-model="config.customModel[config.service]" placeholder="输入模型名称" />
    </div>

    <div v-show="showCustomUrl" class="fr-form-group">
      <span class="fr-form-label">自定义 API 服务地址</span>
      <el-input v-model="config.custom" placeholder="http://localhost:11434/v1/chat/completions" />
    </div>

    <div v-show="showTokenSetting" class="fr-form-group">
      <span class="fr-form-label">API Key (密钥)</span>
      <el-input
        v-model="config.token[config.service]"
        type="textarea"
        :rows="3"
        placeholder="可多行，每行一个 key；支持 key|weight（例如本地key|3）"
      />
    </div>

    <div v-show="showTokenSetting" class="fr-option-row" style="margin-top: 16px; border-top: 1px dashed var(--fr-border-color-lighter); padding-top: 12px;">
      <div class="fr-option-info">
        <span class="fr-option-label">API 负载均衡</span>
        <span class="fr-option-desc">当配置多个 Key 时按权重分配请求</span>
      </div>
      <el-switch v-model="config.loadBalanceEnabled" inline-prompt active-text="开" inactive-text="关" />
    </div>
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
const isCurrentSiteAllowed = computed(() => config.value.allowedMainDomains?.includes(currentMainDomain.value));

const statusText = computed(() => {
  if (config.value.autoTranslateMode === 'whitelist') {
    return isCurrentSiteAllowed.value ? '已开启智能检测' : '默认不自动翻译';
  }
  if (isCurrentSiteAllowed.value) return '总是自动翻译';
  if (isCurrentSiteBlocked.value) return '从不自动翻译';
  return '默认智能检测';
});

const statusClass = computed(() => {
  if (config.value.autoTranslateMode === 'whitelist') {
    return {
      'status-allowed': isCurrentSiteAllowed.value,
      'status-default': !isCurrentSiteAllowed.value
    };
  }
  return {
    'status-allowed': isCurrentSiteAllowed.value,
    'status-blocked': isCurrentSiteBlocked.value,
    'status-default': !isCurrentSiteAllowed.value && !isCurrentSiteBlocked.value
  };
});

const showModel = computed(() => servicesType.isUseModel(config.value.service));
const showCustomModel = computed(() =>
  servicesType.isUseModel(config.value.service) &&
  config.value.model[config.value.service] === customModelString
);
const showCustomUrl = computed(() => servicesType.isUseCustomUrl(config.value.service));
const showTokenSetting = computed(() => servicesType.isCustom(config.value.service));
const modelOptions = computed(() => models.get(config.value.service) || []);

function getMainDomainFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const noProtocol = url.replace(/^(https?:\/\/)/, '');
    const hostname = noProtocol.split('/')[0];
    
    if (hostname === 'twitter.com' || hostname === 'x.com' || 
        hostname === 'www.twitter.com' || hostname === 'www.x.com') {
      return 'x.com';
    }

    const cleanHostname = hostname.replace(/^www\./, '');
    const parts = cleanHostname.split('.');
    if (parts.length >= 3 &&
        ((parts[parts.length - 2] === 'co' || parts[parts.length - 2] === 'com') &&
        parts[parts.length - 1].length === 2)) {
      return parts.slice(-3).join('.');
    }
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return cleanHostname;
  } catch (error) {
    console.error('getMainDomainFromUrl error:', error);
    return '';
  }
}

function ensureLists() {
  if (!Array.isArray(config.value.blockedMainDomains)) {
    config.value.blockedMainDomains = [];
  }
  if (!Array.isArray(config.value.allowedMainDomains)) {
    config.value.allowedMainDomains = [];
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
  ensureLists();
  refreshCurrentMainDomain();
});

storage.watch('local:config', (newValue: any) => {
  if (typeof newValue === 'string' && newValue) {
    Object.assign(config.value, JSON.parse(newValue));
  }
  ensureLists();
});

watch(config, (newValue: any) => {
  storage.setItem('local:config', JSON.stringify(newValue));
}, { deep: true });

async function setSiteAlwaysTranslate() {
  ensureLists();
  if (!currentMainDomain.value) return;
  config.value.blockedMainDomains = config.value.blockedMainDomains.filter(
    (item: string) => item !== currentMainDomain.value
  );
  config.value.allowedMainDomains = Array.from(new Set([
    ...config.value.allowedMainDomains,
    currentMainDomain.value
  ]));
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id) {
    browser.tabs.sendMessage(tab.id, {
      type: 'contextMenuTranslate',
      action: 'fullPage'
    }).catch(() => {});
  }
  ElMessage({ message: '已设定为“总是翻译”此站点', type: 'success', duration: 1500 });
}

async function setSiteNeverTranslate() {
  ensureLists();
  if (!currentMainDomain.value) return;
  config.value.allowedMainDomains = config.value.allowedMainDomains.filter(
    (item: string) => item !== currentMainDomain.value
  );
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
    }).catch(() => {});
  }
  ElMessage({ message: '已设定为“从不翻译”此站点', type: 'success', duration: 1500 });
}

async function resetSiteRule() {
  ensureLists();
  if (!currentMainDomain.value) return;
  config.value.allowedMainDomains = config.value.allowedMainDomains.filter(
    (item: string) => item !== currentMainDomain.value
  );
  config.value.blockedMainDomains = config.value.blockedMainDomains.filter(
    (item: string) => item !== currentMainDomain.value
  );
  ElMessage({ message: '已恢复默认智能检测', type: 'success', duration: 1500 });
}

function removeAllowedDomain(domain: string) {
  ensureLists();
  config.value.allowedMainDomains = config.value.allowedMainDomains.filter(
    (item: string) => item !== domain
  );
}

function removeBlockedDomain(domain: string) {
  ensureLists();
  config.value.blockedMainDomains = config.value.blockedMainDomains.filter(
    (item: string) => item !== domain
  );
}
</script>

<style scoped>
.blacklist-section {
  margin-top: 16px;
  border-top: 1px dashed var(--fr-border-color-lighter);
  padding-top: 12px;
}

.blacklist-header {
  margin-bottom: 8px;
}

.current-site-box {
  background-color: var(--fr-bg-color);
  border: 1px solid var(--fr-border-color);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}

.site-info {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.site-label {
  color: var(--fr-text-color-secondary);
}

.site-domain {
  font-weight: 600;
  color: var(--fr-text-color-primary);
  word-break: break-all;
  flex: 1;
}

.site-status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.site-status.status-allowed {
  background-color: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.site-status.status-blocked {
  background-color: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.site-status.status-default {
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.site-actions {
  display: flex;
  gap: 8px;
}

.site-actions .el-button {
  flex: 1;
}

.blocked-tags-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-label {
  font-size: 11px;
  color: var(--fr-text-color-secondary);
  font-weight: 500;
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.domain-tag {
  border-radius: 4px;
  font-weight: 500;
}

.disabled-state-empty {
  background-color: var(--fr-card-bg);
  border: 1px solid var(--fr-border-color);
  border-radius: var(--fr-border-radius-card);
  padding: 24px;
  margin-bottom: 16px;
  box-shadow: var(--fr-shadow);
}
</style>
