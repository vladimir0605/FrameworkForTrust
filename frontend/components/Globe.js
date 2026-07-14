// src/components/Globe.js
import React, { useRef, useEffect } from "react";
import * as THREE from "three";

import earthTexture from "../assets/globe/earth-texture.jpg";
import earthBump from "../assets/globe/earth-bump.jpg";
import earthSpecular from "../assets/globe/earth-specular.jpg";

function Globe() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const enableCssFallback = () => {
      // CSS fallback: circular Earth image that spins via background-position animation
      container.classList.add("ft-globe-fallback");
      container.style.backgroundImage = `url(${earthTexture})`;
    };

    // 1) Check WebGL availability
    const hasWebGL = (() => {
      try {
        const canvas = document.createElement("canvas");
        return !!(
          window.WebGLRenderingContext &&
          (canvas.getContext("webgl") ||
            canvas.getContext("experimental-webgl"))
        );
      } catch {
        return false;
      }
    })();

    if (!hasWebGL) {
      console.warn(
        "[Globe] WebGL not available — falling back to CSS globe."
      );
      enableCssFallback();
      return; // no WebGL renderer → exit early
    }

    // 2) Attempt WebGL renderer initialisation
    let renderer;
    const width = container.clientWidth || 260;
    const height = container.clientHeight || 260;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
      });

      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio || 1);

      // WebGL succeeded — remove CSS fallback if it was applied
      container.classList.remove("ft-globe-fallback");
      container.style.backgroundImage = "none";

      container.appendChild(renderer.domElement);
    } catch (e) {
      console.error(
        "[Globe] WebGLRenderer initialisation failed, falling back to CSS:",
        e
      );
      enableCssFallback();
      return;
    }

    // 3) Scene, camera, materials
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.z = 5;

    const loader = new THREE.TextureLoader();
    const texture = loader.load(earthTexture);
    const bump = loader.load(earthBump);
    const specular = loader.load(earthSpecular);

    const geometry = new THREE.SphereGeometry(2, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      map: texture,
      bumpMap: bump,
      bumpScale: 0.1,
      specularMap: specular,
      specular: new THREE.Color("gray"),
    });

    const earth = new THREE.Mesh(geometry, material);
    scene.add(earth);

    const ambientLight = new THREE.AmbientLight(0x404040);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 3, 5);
    scene.add(ambientLight, directionalLight);

    let frameId;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      earth.rotation.y += 0.0015;
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || width;
      const newHeight = container.clientHeight || height;
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);

    // Cleanup on unmount
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (
        renderer.domElement &&
        renderer.domElement.parentNode === container
      ) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className="ft-globe-container" ref={containerRef} />;
}

export default Globe;
