<template>
  <div class="ai-history">
    <div class="content">
      <div v-if="historyList.length > 0">
        <div
          v-for="item in historyList"
          :key="item.appConversationID"
          class="info"
          @click="$emit('history-detail', item.appConversationID)"
        >
          <div class="info-pic">{{ item.conversationName.slice(0, 1) }}</div>
          <div class="info-content">
            <div class="info-content-title">{{ item.conversationName }}</div>
            <div class="info-content-time">{{ item.createTime }}</div>
          </div>
          <div class="clear-history" @click.stop="handleClear(item.appConversationID)">删除</div>
        </div>
      </div>
    </div>

    <div class="ai-add" @click="$emit('new-answer')">
      <img :src="addsImg" />
      <span style="color: #333333">新建AI对话</span>
    </div>

    <!-- Custom Modal -->
    <Teleport to="body">
      <div v-if="dialogVisible" class="ai-modal-overlay" @click.self="dialogVisible = false">
        <div class="ai-modal">
          <div class="ai-modal-header">确定要删除该历史记录吗？</div>
          <div class="ai-modal-body">一旦删除，数据将无法恢复。</div>
          <div class="ai-modal-footer">
            <button class="ai-modal-btn cancel" @click="dialogVisible = false">取消</button>
            <button class="ai-modal-btn confirm" @click="handleDelete">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getConversationList, deleteConversation } from '@/core/services/api'
import { getConfig } from '@/core/services/request'
import { showToast } from '@/core/utils'
import type { HistoryItem } from '@/core/types'

import addsImg from '@/assets/image/adds.png'

const emit = defineEmits<{
  'history-detail': [appConversationId: string]
  'new-answer': []
}>()

const cfg = getConfig()
const apis = cfg.apis

const historyList = ref<HistoryItem[]>([])
const dialogVisible = ref(false)
const deleteId = ref('')

async function getList() {
  try {
    const result = await getConversationList(apis)
    if (result?.conversationList) {
      historyList.value = result.conversationList
        .filter((item: any) => item !== null)
        .map((item: any) => ({ ...item, selected: false }))
    }
  } catch (e: any) {
    showToast(e?.message || '获取历史记录失败')
  }
}

function handleClear(id: string) {
  deleteId.value = id
  dialogVisible.value = true
}

async function handleDelete() {
  dialogVisible.value = false
  try {
    await deleteConversation(apis, deleteId.value)
    await getList()
  } catch (e: any) {
    showToast(e?.message || '删除失败')
    await getList()
  }
}

onMounted(() => {
  getList()
})
</script>

<style scoped>
.ai-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.ai-modal {
  background: #fff;
  border-radius: 8px;
  width: 300px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.ai-modal-header {
  padding: 16px 24px;
  font-weight: 500;
  font-size: 16px;
  color: #333;
  border-bottom: 1px solid #f0f0f0;
}
.ai-modal-body {
  padding: 24px;
  font-size: 14px;
  color: #666;
}
.ai-modal-footer {
  padding: 10px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid #f0f0f0;
}
.ai-modal-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #333;
  transition: all 0.2s;
}
.ai-modal-btn:hover {
  border-color: #74acb2;
  color: #74acb2;
}
.ai-modal-btn.confirm {
  background: #74acb2;
  border-color: #74acb2;
  color: #fff;
}
.ai-modal-btn.confirm:hover {
  background: #5a969e;
}
</style>
