window.showToast = function(message){const el=document.getElementById('toast');if(!el)return;el.textContent=message;el.classList.remove('hidden');setTimeout(()=>el.classList.add('hidden'),3000)};
