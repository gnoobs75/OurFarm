import * as THREE from 'three';
import { TILE_SIZE } from '@shared/constants.js';

export class MachineRenderer {
  constructor(scene) {
    this.scene = scene;
    this.machineMeshes = new Map();
  }

  build(machines) {
    for (const m of machines) {
      this.addMachine(m);
    }
  }

  addMachine(data) {
    const group = new THREE.Group();

    switch (data.type) {
      case 'keg': {
        // Brown barrel - cylinder
        const barrelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8);
        const barrel = new THREE.Mesh(barrelGeo, new THREE.MeshLambertMaterial({ color: 0x8B4513, flatShading: true }));
        barrel.position.y = 0.1;
        group.add(barrel);
        // Barrel rings
        const ringGeo = new THREE.TorusGeometry(0.12, 0.01, 4, 8);
        const ringMat = new THREE.MeshLambertMaterial({ color: 0x666666, flatShading: true });
        const ring1 = new THREE.Mesh(ringGeo, ringMat);
        ring1.position.y = 0.06;
        ring1.rotation.x = Math.PI / 2;
        group.add(ring1);
        const ring2 = new THREE.Mesh(ringGeo, ringMat);
        ring2.position.y = 0.14;
        ring2.rotation.x = Math.PI / 2;
        group.add(ring2);
        break;
      }
      case 'preserves_jar': {
        // Short glass-colored cylinder
        const jarGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.15, 8);
        const jar = new THREE.Mesh(jarGeo, new THREE.MeshLambertMaterial({ color: 0xAADDFF, flatShading: true, transparent: true, opacity: 0.7 }));
        jar.position.y = 0.075;
        group.add(jar);
        // Lid
        const lidGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 8);
        const lid = new THREE.Mesh(lidGeo, new THREE.MeshLambertMaterial({ color: 0xCCCCCC, flatShading: true }));
        lid.position.y = 0.16;
        group.add(lid);
        break;
      }
      case 'cheese_press': {
        // Wooden box with handle
        const boxGeo = new THREE.BoxGeometry(0.2, 0.12, 0.15);
        const box = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xDEB887, flatShading: true }));
        box.position.y = 0.06;
        group.add(box);
        // Handle lever
        const handleGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.12, 4);
        const handle = new THREE.Mesh(handleGeo, new THREE.MeshLambertMaterial({ color: 0x444444, flatShading: true }));
        handle.position.set(0, 0.15, 0);
        handle.rotation.z = Math.PI / 4;
        group.add(handle);
        break;
      }
      case 'mayonnaise_machine': {
        // Box with cone on top
        const mboxGeo = new THREE.BoxGeometry(0.16, 0.1, 0.16);
        const mbox = new THREE.Mesh(mboxGeo, new THREE.MeshLambertMaterial({ color: 0xEEEEDD, flatShading: true }));
        mbox.position.y = 0.05;
        group.add(mbox);
        const coneGeo = new THREE.ConeGeometry(0.06, 0.1, 6);
        const cone = new THREE.Mesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0xCC0000, flatShading: true }));
        cone.position.y = 0.15;
        group.add(cone);
        break;
      }
      default: {
        // Generic box
        const defGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        const def = new THREE.Mesh(defGeo, new THREE.MeshLambertMaterial({ color: 0x999999, flatShading: true }));
        def.position.y = 0.075;
        group.add(def);
      }
    }

    const wx = data.tileX * TILE_SIZE + TILE_SIZE / 2;
    const wz = data.tileZ * TILE_SIZE + TILE_SIZE / 2;
    group.position.set(wx, 0, wz);

    this.scene.add(group);
    this.machineMeshes.set(data.id, { mesh: group, data });
  }

  getMachineAtPosition(worldX, worldZ) {
    const threshold = 0.5;
    for (const [id, entry] of this.machineMeshes) {
      const dx = entry.mesh.position.x - worldX;
      const dz = entry.mesh.position.z - worldZ;
      if (Math.sqrt(dx * dx + dz * dz) < threshold) return id;
    }
    return null;
  }

  updateMachine(machineData) {
    const entry = this.machineMeshes.get(machineData.id);
    if (entry) entry.data = machineData;
  }

  removeMachine(id) {
    const entry = this.machineMeshes.get(id);
    if (entry) {
      this.scene.remove(entry.mesh);
      entry.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.machineMeshes.delete(id);
    }
  }

  dispose() {
    for (const [id] of this.machineMeshes) {
      this.removeMachine(id);
    }
  }
}
