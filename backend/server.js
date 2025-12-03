import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bd from "./src/models/index.js";
import redisClient from "./src/config/redis.js";
import supabase from "./src/config/supabase.js";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const { Task } = bd;

// Configurar multer para upload em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'), false);
    }
  }
});

// Função para invalidar cache
const invalidateTasksCache = async () => {
  try {
    if (redisClient.isOpen) {
      await redisClient.del("tasks:all");
      console.log("🗑️ Cache de tasks invalidado");
    } else {
      console.log("⚠️ Redis desconectado - cache não invalidado");
    }
  } catch (error) {
    console.error("Erro ao invalidar cache:", error.message);
  }
};

// Testa a conexão com o banco de dados
try {
  await bd.sequelize.authenticate();
  console.log("Conexão com o banco de dados estabelecida com sucesso.");
} catch (error) {
  console.error("Erro ao conectar ao banco de dados:", error);
  process.exit(1);
}

// Conecta ao Redis
try {
  await redisClient.connect();
} catch (error) {
  console.error("Erro ao conectar ao Redis:", error);
}

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.json({ message: "Hello World" });
});

app.get("/tasks", async (req, res) => {
  const cacheKey = "tasks:all";
  let tasks;
  
  try {
    // Tentar buscar do cache se Redis estiver conectado
    if (redisClient.isOpen) {
      const cachedTasks = await redisClient.get(cacheKey);
      
      if (cachedTasks) {
        console.log("🎯 CACHE HIT: Tasks encontradas no cache");
        return res.json(JSON.parse(cachedTasks));
      }
    }
    
    console.log("❌ CACHE MISS: Buscando tasks no banco de dados");
    
    // Buscar do banco de dados
    tasks = await Task.findAll();
    
    // Salvar no cache se Redis estiver conectado
    if (redisClient.isOpen) {
      try {
        await redisClient.setEx(cacheKey, 300, JSON.stringify(tasks));
        console.log("💾 Cache atualizado com", tasks.length, "tasks");
      } catch (cacheError) {
        console.log("⚠️ Erro ao salvar no cache:", cacheError.message);
      }
    }
    
    res.json(tasks);
  } catch (error) {
    console.error("Erro geral:", error.message);
    // Fallback: buscar direto do banco
    tasks = await Task.findAll();
    res.json(tasks);
  }
});

app.post("/tasks", async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "Descrição obrigatória" });
  const task = await Task.create({ description, completed: false });
  
  // Invalidar cache após criar task
  await invalidateTasksCache();
  
  res.status(201).json(task);
});

app.get("/tasks/:id", async (req, res) => {
  const task = await Task.findByPk(req.params.id);
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada" });
  res.json(task);
});

app.put("/tasks/:id", async (req, res) => {
  const { description, completed } = req.body;
  const task = await Task.findByPk(req.params.id);
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada" });
  await task.update({ description, completed });
  
  // Invalidar cache após atualizar task
  await invalidateTasksCache();
  
  res.json(task);
});

app.delete("/tasks/:id", async (req, res) => {
  const deleted = await Task.destroy({ where: { id: req.params.id } });
  if (!deleted) return res.status(404).json({ error: "Tarefa não encontrada" });
  
  // Invalidar cache após deletar task
  await invalidateTasksCache();
  
  res.status(204).send();
});

// Rota para upload de foto de perfil
app.post("/profile/photo", upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma foto enviada" });
    }

    if (!supabase) {
      return res.status(500).json({ error: "Supabase não configurado" });
    }

    // Gerar nome único para o arquivo
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;
    const filePath = `profiles/${fileName}`;

    console.log("📷 Fazendo upload da foto:", fileName);

    // Upload para Supabase Storage
    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET || 'profile-photos')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) {
      console.error("Erro no upload:", error);
      return res.status(500).json({ error: "Erro ao fazer upload da foto" });
    }

    // Obter URL pública da foto
    const { data: publicUrlData } = supabase.storage
      .from(process.env.SUPABASE_BUCKET || 'profile-photos')
      .getPublicUrl(filePath);

    console.log("✅ Upload realizado com sucesso:", publicUrlData.publicUrl);

    res.json({
      message: "Foto de perfil atualizada com sucesso",
      photoUrl: publicUrlData.publicUrl,
      fileName: fileName
    });

  } catch (error) {
    console.error("Erro no upload:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Database is running on port ${process.env.DB_PORT}`);
});