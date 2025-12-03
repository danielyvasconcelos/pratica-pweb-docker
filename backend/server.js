import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bd from "./src/models/index.js";
import redisClient from "./src/config/redis.js";

dotenv.config();

const { Task } = bd;

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
  
  try {
    // Tentar buscar do cache
    const cachedTasks = await redisClient.get(cacheKey);
    
    if (cachedTasks) {
      console.log("🎯 CACHE HIT: Tasks encontradas no cache");
      return res.json(JSON.parse(cachedTasks));
    }
    
    console.log("❌ CACHE MISS: Buscando tasks no banco de dados");
    
    // Buscar do banco de dados
    const tasks = await Task.findAll();
    
    // Salvar no cache por 5 minutos (300 segundos)
    await redisClient.setEx(cacheKey, 300, JSON.stringify(tasks));
    
    console.log("💾 Cache atualizado com", tasks.length, "tasks");
    
    res.json(tasks);
  } catch (error) {
    console.error("Erro no cache:", error);
    // Fallback: buscar direto do banco
    const tasks = await Task.findAll();
    res.json(tasks);
  }
});

app.post("/tasks", async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "Descrição obrigatória" });
  const task = await Task.create({ description, completed: false });
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
  res.json(task);
});

app.delete("/tasks/:id", async (req, res) => {
  const deleted = await Task.destroy({ where: { id: req.params.id } });
  if (!deleted) return res.status(404).json({ error: "Tarefa não encontrada" });
  res.status(204).send();
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Database is running on port ${process.env.DB_PORT}`);
});