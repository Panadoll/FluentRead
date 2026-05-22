<template>
  <div class="popup-wrapper">
    <header class="popup-header">
      <Header/>
    </header>
    <main class="popup-main">
      <Main/>
    </main>
    <footer class="popup-footer">
      <Footer/>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import Header from '../../components/Header.vue';
import Main from "../../components/Main.vue";
import Footer from "../../components/Footer.vue";
import '../../styles/theme.css';
import 'element-plus/theme-chalk/base.css';
import 'element-plus/theme-chalk/dark/css-vars.css';

</script>

<style scoped>
.popup-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 480px;
}

.popup-header {
  margin-bottom: 12px;
}

.popup-main {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 12px;
}

.popup-footer {
  margin-top: auto;
}
</style>
