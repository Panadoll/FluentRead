<template>
  <div class="footer-container">
    <div class="stat-container">
      <p class="translation-count">
        已为您累计翻译
        <span class="count-number">{{ computedCount }}</span>
        次
      </p>
    </div>
    <div class="footer-links">
      <el-link 
        class="action-link left-link" 
        :class="{ 'failed': buttonText === '清除失败', 'success': buttonText === '清除成功' }" 
        @click="clearCache"
        :disabled="buttonDisabled"
        :underline="false"
      >
        <el-icon v-if="showLoading">
          <Loading class="el-icon-loading" />
        </el-icon>
        {{ buttonText }}
      </el-link>
      <el-link 
        class="action-link right-link" 
        href="https://fluent.thinkstu.com/" 
        target="_blank"
        :underline="false"
      >
        <el-icon class="github-icon">
          <Star />
        </el-icon>
        GitHub开源
      </el-link>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import { Star, Loading } from "@element-plus/icons-vue";
import { Config } from "../entrypoints/utils/model";
import { storage } from '@wxt-dev/storage';
import browser from 'webextension-polyfill';

const buttonDisabled = ref(false);
const buttonText = ref('清除翻译缓存');
const showLoading = ref(false);

async function clearCache() {
  try {
    buttonDisabled.value = true;
    buttonText.value = "正在清除...";
    showLoading.value = true;

    // 获取当前标签页
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      throw new Error('No active tab found');
    }

    // 发送消息到 content.js
    await browser.tabs.sendMessage(tabs[0].id, { message: 'clearCache' });

    // 显示成功状态
    buttonText.value = "清除成功";

    // 恢复按钮状态
    setTimeout(() => {
      buttonDisabled.value = false;
      buttonText.value = '清除翻译缓存';
      showLoading.value = false;
    }, 1500);

  } catch (error) {
    console.error('清除缓存失败:', error);
    buttonText.value = "清除失败";

    // 恢复按钮状态
    setTimeout(() => {
      buttonDisabled.value = false;
      buttonText.value = '清除翻译缓存';
      showLoading.value = false;
    }, 1500);
  }
}

// 获取配置，用于显示翻译次数
let localConfig = reactive(new Config());

storage.getItem('local:config').then((value) => {
  if (typeof value === 'string' && value) Object.assign(localConfig, JSON.parse(value));
});

storage.watch('local:config', (newValue, oldValue) => {
  if (typeof newValue === 'string' && newValue) Object.assign(localConfig, JSON.parse(newValue));
});

const computedCount = computed(() => localConfig.count);
</script>

<style scoped>
.footer-container {
  padding: 16px 0 8px 0;
  border-top: 1px solid var(--fr-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-container {
  display: flex;
  justify-content: center;
  align-items: center;
}

.translation-count {
  margin: 0;
  font-size: 12px;
  color: var(--fr-text-color-regular);
  display: flex;
  align-items: center;
  gap: 4px;
  background-color: var(--fr-hover-color);
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid var(--fr-border-color-lighter);
}

.count-number {
  font-weight: 600;
  color: var(--el-color-primary);
}

.footer-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.action-link {
  font-size: 12px;
  color: var(--fr-text-color-regular) !important;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-link:hover {
  color: var(--el-color-primary) !important;
  opacity: 0.9;
}

.action-link:active {
  transform: scale(0.97);
}

.github-icon {
  font-size: 13px;
}

:deep(.el-icon-loading) {
  animation: rotating 1s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.failed {
  color: var(--el-color-danger) !important;
}

.action-link.success {
  color: var(--el-color-success) !important;
}
</style>
