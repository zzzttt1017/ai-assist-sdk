<template>
  <div class="container info">
    <div class="info-item">
      <div class="heading">
        <div class="heading-column" />
        <div class="heading-title">基本信息</div>
      </div>
      <div class="basic-content">
        <div class="basic-content-text basic-content-key">姓名</div>
        <div class="basic-content-text">{{ info?.name || '' }}</div>
      </div>
      <div class="basic-content">
        <div class="basic-content-text basic-content-key">用户名</div>
        <div class="basic-content-text">{{ info?.userName || '' }}</div>
      </div>
    </div>
    <div class="info-item">
      <div class="heading">
        <div class="heading-column" />
        <div class="heading-title">数据权限</div>
      </div>
      <div class="permission-content">
        <div v-for="(item, idx) in info?.ptnameList" :key="idx" class="permission-content-text">{{ item }}</div>
      </div>
    </div>
    <div class="info-item">
      <div class="heading">
        <div class="heading-column" />
        <div class="heading-title">帮助信息</div>
      </div>
      <div class="basic-content">
        <div class="basic-content-text basic-content-key">部门</div>
        <div class="basic-content-text">{{ info?.dept || '' }}</div>
      </div>
      <div class="basic-content">
        <div class="basic-content-text basic-content-key">邮箱</div>
        <div class="basic-content-text">{{ info?.email || '' }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getPersonalInfo } from '@/core/services/api'
import { getConfig } from '@/core/services/request'
import type { PersonalInfo } from '@/core/types'

const cfg = getConfig()
const info = ref<PersonalInfo | null>(null)

onMounted(async () => {
  info.value = await getPersonalInfo(cfg.apis)
})
</script>
