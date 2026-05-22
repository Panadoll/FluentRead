<template>
  <div class="header-container">
    <div class="logo-area">
      <!-- 极简 SaaS 渐变 SVG Logo -->
      <div class="logo-icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="logoGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#6366f1" />
              <stop offset="100%" stop-color="#4f46e5" />
            </linearGradient>
          </defs>
          <rect width="24" height="24" rx="6" fill="url(#logoGrad)" />
          <!-- 翻译 A 与中 抽象书本折角 -->
          <path d="M7 16V8C7 7.44772 7.44772 7 8 7H16C16.5523 7 17 7.44772 17 8V16C17 16.5523 16.5523 17 16 17H8C7.44772 17 7 16.5523 7 16Z" stroke="white" stroke-width="1.5" stroke-linejoin="round" />
          <path d="M10 10.5H14M12 9V14.5M10.5 14H13.5" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </div>
      <h1 class="title">流畅阅读</h1>
      <span class="version-badge">V{{ version }}</span>
    </div>
    <!-- 运行状态指示灯 -->
    <div class="status-indicator">
      <span class="pulse-dot"></span>
      <span class="status-text">工作正常</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
const version = process.env.VUE_APP_VERSION
</script>

<style scoped>
.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 4px 12px 4px;
}

.logo-area {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-icon svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 2px 4px rgba(99, 102, 241, 0.2));
}

.title {
  font-size: 15px;
  margin: 0;
  color: var(--fr-text-color-primary);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.version-badge {
  font-size: 10px;
  font-weight: 600;
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  padding: 2px 6px;
  border-radius: 12px;
  border: 1px solid var(--el-color-primary-light-8);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: var(--fr-card-bg);
  border: 1px solid var(--fr-border-color);
  padding: 4px 10px;
  border-radius: 20px;
  box-shadow: var(--fr-shadow-sm);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background-color: #22c55e;
  border-radius: 50%;
  position: relative;
}

.pulse-dot::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: #22c55e;
  border-radius: 50%;
  animation: pulse 1.6s infinite ease-in-out;
  left: 0;
  top: 0;
}

.status-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--fr-text-color-regular);
}

@keyframes pulse {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  100% {
    transform: scale(2.8);
    opacity: 0;
  }
}
</style>
