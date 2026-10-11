// ─────────────────────────────────────────────────────────────────────────────
//  WebGPU renderer
// ─────────────────────────────────────────────────────────────────────────────
const SHADOW_RES = 2048;
const HDR = 'rgba16float';

class Renderer {
  constructor(device, context, format) {
    this.device = device; this.context = context; this.format = format;
    this.uni = new Float32Array(144);
    this.objData = new Float32Array(SLOT.TOTAL * 20);
    this.size = [0, 0];
  }
  init(meshes) {
    const d = this.device;
    const mod = d.createShaderModule({ code: makeWGSL(LAYOUT) });
    this.module = mod;
    this.ubuf = d.createBuffer({ size: this.uni.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.obuf = d.createBuffer({ size: this.objData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    for (let s = 0; s < SLOT.TOTAL; s++) this.objData.set(m4.id(), s * 20);
    this.shadowTex = d.createTexture({ size: [SHADOW_RES, SHADOW_RES], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.dummyDepth = d.createTexture({ size: [1, 1], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    const gridTex = () => d.createTexture({ size: [GRID, GRID], format: 'r32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.etaTex = gridTex(); this.terrTex = gridTex();
    this.shadowSamp = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
    this.linSamp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    const V = GPUShaderStage.VERTEX, F = GPUShaderStage.FRAGMENT;
    this.bgl0 = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: V | F, buffer: { type: 'uniform' } },
        { binding: 1, visibility: V | F, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: F, texture: { sampleType: 'depth' } },
        { binding: 3, visibility: F, sampler: { type: 'comparison' } },
        { binding: 4, visibility: V | F, texture: { sampleType: 'unfilterable-float' } },
        { binding: 5, visibility: V | F, texture: { sampleType: 'unfilterable-float' } },
        { binding: 6, visibility: F, sampler: { type: 'filtering' } },
      ],
    });
    this.bgl1 = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, texture: { sampleType: 'float' } },
        { binding: 1, visibility: F, texture: { sampleType: 'depth' } },
      ],
    });
    const mkBG0 = (shadow) => d.createBindGroup({
      layout: this.bgl0,
      entries: [
        { binding: 0, resource: { buffer: this.ubuf } }, { binding: 1, resource: { buffer: this.obuf } },
        { binding: 2, resource: shadow.createView() }, { binding: 3, resource: this.shadowSamp },
        { binding: 4, resource: this.etaTex.createView() }, { binding: 5, resource: this.terrTex.createView() },
        { binding: 6, resource: this.linSamp },
      ],
    });
    this.bg0 = mkBG0(this.shadowTex);
    this.bg0Shadow = mkBG0(this.dummyDepth);
    const layA = d.createPipelineLayout({ bindGroupLayouts: [this.bgl0] });
    const layB = d.createPipelineLayout({ bindGroupLayouts: [this.bgl0, this.bgl1] });

    const meshVB = {
      arrayStride: VSTRIDE * 4,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x3' }, { shaderLocation: 3, offset: 36, format: 'float32x2' },
        { shaderLocation: 4, offset: 44, format: 'float32x3' },
      ],
    };
    const depthOpaque = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' };
    this.pMesh = d.createRenderPipeline({
      layout: layA,
      vertex: { module: mod, entryPoint: 'vsMesh', buffers: [meshVB] },
      fragment: { module: mod, entryPoint: 'fsMesh', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthOpaque,
    });
    this.pShadow = d.createRenderPipeline({
      layout: layA,
      vertex: { module: mod, entryPoint: 'vsShadow', buffers: [meshVB] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.0 },
    });
    this.pBackdrop = d.createRenderPipeline({
      layout: layA,
      vertex: { module: mod, entryPoint: 'vsFull' },
      fragment: { module: mod, entryPoint: 'fsBackdrop', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
    });
    this.pSkull = d.createRenderPipeline({
      layout: layA,
      vertex: { module: mod, entryPoint: 'vsSkull', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      fragment: { module: mod, entryPoint: 'fsSkull', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'front' },
      depthStencil: depthOpaque,
    });
    this.pWater = d.createRenderPipeline({
      layout: layB,
      vertex: { module: mod, entryPoint: 'vsWater', buffers: [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }] },
      fragment: { module: mod, entryPoint: 'fsWater', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
    });
    const premul = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    this.pPart = d.createRenderPipeline({
      layout: layB,
      vertex: {
        module: mod, entryPoint: 'vsPart',
        buffers: [{
          arrayStride: 48, stepMode: 'instance',
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }, { shaderLocation: 2, offset: 32, format: 'float32x4' }],
        }],
      },
      fragment: { module: mod, entryPoint: 'fsPart', targets: [{ format: HDR, blend: premul }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'less' },
    });
    this.pComposite = d.createRenderPipeline({
      layout: layB,
      vertex: { module: mod, entryPoint: 'vsFull' },
      fragment: { module: mod, entryPoint: 'fsComposite', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });

    const upload = (data, usage) => {
      const b = d.createBuffer({ size: Math.max(16, (data.byteLength + 3) & ~3), usage: usage | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(b, 0, data);
      return b;
    };
    const VB = GPUBufferUsage.VERTEX, IB = GPUBufferUsage.INDEX;
    this.meshes = {};
    for (const [k, m] of Object.entries(meshes)) {
      this.meshes[k] = { vb: upload(m.verts, VB), ib: upload(m.idx, IB), count: m.count };
    }
    this.partBuf = d.createBuffer({ size: 3200 * 48, usage: VB | GPUBufferUsage.COPY_DST });
    // static terrain grid
    const terr = new Float32Array(GRID * GRID);
    const dx = (2 * HALF) / GRID;
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) terr[j * GRID + i] = H(-HALF + (i + 0.5) * dx, -HALF + (j + 0.5) * dx);
    d.queue.writeTexture({ texture: this.terrTex }, terr, { bytesPerRow: GRID * 4 }, [GRID, GRID]);
  }
  resize(w, h) {
    if (w === this.size[0] && h === this.size[1]) return;
    this.size = [w, h];
    const d = this.device;
    for (const t of ['colorTex', 'copyTex', 'depthTex']) if (this[t]) this[t].destroy();
    this.colorTex = d.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC });
    this.copyTex = d.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    this.depthTex = d.createTexture({ size: [w, h], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.bgWater = d.createBindGroup({ layout: this.bgl1, entries: [{ binding: 0, resource: this.copyTex.createView() }, { binding: 1, resource: this.depthTex.createView() }] });
    this.bgComposite = d.createBindGroup({ layout: this.bgl1, entries: [{ binding: 0, resource: this.colorTex.createView() }, { binding: 1, resource: this.depthTex.createView() }] });
  }
  setObj(slot, m, bend) {
    const o = slot * 20;
    this.objData.set(m, o);
    if (bend) { this.objData[o + 16] = bend[0]; this.objData[o + 17] = bend[1]; this.objData[o + 18] = bend[2]; this.objData[o + 19] = bend[3] || 0; }
    else { this.objData[o + 16] = 0; this.objData[o + 17] = 0; this.objData[o + 18] = 0; this.objData[o + 19] = 0; }
  }
  frame(eta, partCount, partData, counts) {
    const d = this.device, q = d.queue;
    q.writeBuffer(this.ubuf, 0, this.uni);
    q.writeBuffer(this.obuf, 0, this.objData);
    q.writeTexture({ texture: this.etaTex }, eta, { bytesPerRow: GRID * 4 }, [GRID, GRID]);
    if (partCount > 0) q.writeBuffer(this.partBuf, 0, partData, 0, partCount * 12);
    const enc = d.createCommandEncoder();
    const M = this.meshes;
    const drawMesh = (pass, m, inst = 1) => { pass.setVertexBuffer(0, m.vb); pass.setIndexBuffer(m.ib, 'uint32'); pass.drawIndexed(m.count, inst); };
    // 1. shadow map
    {
      const pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      pass.setPipeline(this.pShadow);
      pass.setBindGroup(0, this.bg0Shadow);
      drawMesh(pass, M.main);
      drawMesh(pass, M.ball, counts.ball); drawMesh(pass, M.barrel, counts.barrel); drawMesh(pass, M.coin, counts.coin);
      drawMesh(pass, M.crate, SLOT.NCRATE); drawMesh(pass, M.fruit, SLOT.NFRUIT);
      pass.end();
    }
    // 2. opaque scene
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.colorTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: this.depthTex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      pass.setBindGroup(0, this.bg0);
      pass.setPipeline(this.pBackdrop); pass.draw(3);
      pass.setPipeline(this.pMesh);
      drawMesh(pass, M.floor);
      drawMesh(pass, M.main);
      drawMesh(pass, M.ball, counts.ball); drawMesh(pass, M.barrel, counts.barrel); drawMesh(pass, M.coin, counts.coin);
      drawMesh(pass, M.crate, SLOT.NCRATE); drawMesh(pass, M.fruit, SLOT.NFRUIT);
      drawMesh(pass, M.link, SLOT.NCHAIN);
      pass.setPipeline(this.pSkull);
      drawMesh(pass, M.skull);
      pass.end();
    }
    enc.copyTextureToTexture({ texture: this.colorTex }, { texture: this.copyTex }, this.size);
    // 3. jelly sea + 4. particles
    {
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: this.colorTex.createView(), loadOp: 'load', storeOp: 'store' }],
        depthStencilAttachment: { view: this.depthTex.createView(), depthReadOnly: true },
      });
      pass.setBindGroup(0, this.bg0);
      pass.setBindGroup(1, this.bgWater);
      pass.setPipeline(this.pWater);
      drawMesh(pass, M.water);
      if (partCount > 0) {
        pass.setPipeline(this.pPart);
        pass.setVertexBuffer(0, this.partBuf);
        pass.draw(6, partCount);
      }
      pass.end();
    }
    // 5. composite to the canvas
    {
      const view = this.context.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({ colorAttachments: [{ view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
      pass.setPipeline(this.pComposite);
      pass.setBindGroup(0, this.bg0);
      pass.setBindGroup(1, this.bgComposite);
      pass.draw(3);
      pass.end();
    }
    q.submit([enc.finish()]);
  }
}
