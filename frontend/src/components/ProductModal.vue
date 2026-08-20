<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue';

const props = defineProps({
  modelValue: Boolean,
  product: { type: Object, default: null },
  saving: Boolean
});
const emit = defineEmits(['update:modelValue', 'save']);

const formRef = ref();
const form = reactive({ sku: '', name: '', config: '', color: '', remark: '' });
const title = computed(() => (props.product ? '编辑商品' : '新增商品'));
const rules = {
  sku: [{ required: true, message: '请输入 SKU', trigger: 'blur' }],
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }]
};

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return;
    Object.assign(form, {
      sku: props.product?.sku ?? '',
      name: props.product?.name ?? '',
      config: props.product?.config ?? '',
      color: props.product?.color ?? '',
      remark: props.product?.remark ?? ''
    });
    await nextTick();
    formRef.value?.clearValidate();
  }
);

async function submit() {
  await formRef.value.validate();
  emit('save', { ...form });
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="520px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <div class="form-row">
        <el-form-item label="SKU（标签编号）" prop="sku">
          <el-input v-model="form.sku" maxlength="60" placeholder="例如：28976" />
        </el-form-item>
        <el-form-item label="商品名称" prop="name">
          <el-input v-model="form.name" maxlength="100" placeholder="例如：Legion Y7000" />
        </el-form-item>
      </div>
      <el-form-item label="配置信息" prop="config">
        <el-input v-model="form.config" maxlength="300" placeholder="例如：C7 245HX / 16G / 1T / 5060" />
      </el-form-item>
      <el-form-item label="颜色" prop="color">
        <el-input v-model="form.color" maxlength="80" placeholder="可留空，例如：黑色/白色" />
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="500" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>
