package edu.upenn.cis.nets2120.hw3;

import java.io.FileNotFoundException;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.Reader;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.ArrayList;
import java.util.Scanner;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.apache.spark.api.java.JavaPairRDD;
import org.apache.spark.api.java.JavaRDD;
import org.apache.spark.api.java.JavaSparkContext;
import org.apache.spark.api.java.function.FlatMapFunction;
import org.apache.spark.api.java.function.PairFunction;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.catalyst.expressions.GenericRowWithSchema;
import org.apache.spark.sql.types.StructType;

import com.amazonaws.services.dynamodbv2.document.BatchWriteItemOutcome;
import com.amazonaws.services.dynamodbv2.document.DynamoDB;
import com.amazonaws.services.dynamodbv2.document.Item;
import com.amazonaws.services.dynamodbv2.document.Table;
import com.amazonaws.services.dynamodbv2.document.TableWriteItems;
import com.amazonaws.services.dynamodbv2.document.UpdateItemOutcome;
import com.amazonaws.services.dynamodbv2.document.api.PutItemApi;
import com.amazonaws.services.dynamodbv2.model.AttributeDefinition;
import com.amazonaws.services.dynamodbv2.model.KeySchemaElement;
import com.amazonaws.services.dynamodbv2.model.KeyType;
import com.amazonaws.services.dynamodbv2.model.ProvisionedThroughput;
import com.amazonaws.services.dynamodbv2.model.ResourceInUseException;
import com.amazonaws.services.dynamodbv2.model.ScalarAttributeType;
import com.opencsv.CSVParser;
import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;

import edu.upenn.cis.nets2120.config.Config;
// import edu.upenn.cis.nets2120.hw3.Article;
import edu.upenn.cis.nets2120.storage.DynamoConnector;
import edu.upenn.cis.nets2120.storage.SparkConnector;
import scala.Tuple2;
import software.amazon.awssdk.services.dynamodb.model.DynamoDbException;

import com.google.gson.Gson; 
import com.google.gson.GsonBuilder;  
import java.io.InputStream;
import java.net.URL;

public class LoadNews {
	/**
	 * The basic logger
	 */
	static Logger logger = LogManager.getLogger(LoadNews.class);

	/**
	 * Connection to DynamoDB
	 */
	DynamoDB db;
	Table news;
		
	/**
	 * Connection to Apache Spark
	 */
	SparkSession spark;
	
	JavaSparkContext context;
	
	public LoadNews() {
		System.setProperty("file.encoding", "UTF-8");
	}
	
	private void initializeTables() throws DynamoDbException, InterruptedException {
		try {
			news = db.createTable("news", Arrays.asList(new KeySchemaElement("id", KeyType.HASH)), // Partition
																												// key
					Arrays.asList(new AttributeDefinition("id", ScalarAttributeType.N)),
					new ProvisionedThroughput(25L, 25L)); // Stay within the free tier

			news.waitForActive();
		} catch (final ResourceInUseException exists) {
			news = db.getTable("news");
		}
	}
	

	/**
	 * Initialize the database connection and open the file
	 * 
	 * @throws IOException
	 * @throws InterruptedException 
	 * @throws DynamoDbException 
	 */
	public void initialize() throws IOException, DynamoDbException, InterruptedException {
		logger.info("Connecting to DynamoDB...");
		db = DynamoConnector.getConnection(Config.DYNAMODB_URL);
		
		spark = SparkConnector.getSparkConnection();
		context = SparkConnector.getSparkContext();
		
		initializeTables();
		
		logger.debug("Connected!");
	}

	/**
	 * Load articles into database
	 * 
	 * @param filePath
	 * @return
	 * @throws IOException
	 */
	void getArticles(String filepath) throws IOException {
		Scanner reader = null;
		InputStream fil = null;
		GsonBuilder builder = new GsonBuilder(); 
		builder.setPrettyPrinting(); 
		
		Gson gson = builder.create(); 

		try {
			fil = new URL(filepath).openStream();
			reader = new Scanner(fil, "UTF-8");
	
			String nextLine = null;
			// create schema with all cols in same order
			// final StructType schema = new StructType()
            //         .add("id", "int")
			// 		.add("category", "string")
			// 		.add("headline", "string")
			// 		.add("authors", "string")
			// 		.add("link", "string")
			// 		.add("short_description", "string")
			// 		.add("date", "string");
			// int cols = 7;
			
			// create a list of articles
			ArrayList<Article> list = new ArrayList<>();

			try {
				while (reader.hasNextLine()) {
					nextLine = reader.nextLine();
					Article a = gson.fromJson(nextLine, Article.class);
					list.add(a);
				}
				reader.close();

				int id = 0;
				HashSet<Item> itemSet = new HashSet<>();

				int i = 0;
				for (Article a : list) {
					Item item = new Item()
							.withPrimaryKey("id", i)
							.withString("category", a.getCategory())
							.withString("headline", a.getHeadline())
							.withString("authors", a.getAuthors())
							.withString("link", a.getLink())
							.withString("description", a.getShort_description())
							.withString("date", a.getDate());
					if (itemSet.size() >= 25) {
						TableWriteItems twi = new TableWriteItems("news");
						twi.withItemsToPut(itemSet);
						BatchWriteItemOutcome unpr = db.batchWriteItem(twi);
						// System.out.println("write");
						// keep writing until nothing is unprocessed
						while (unpr.getUnprocessedItems().size() != 0) {
							unpr = db.batchWriteItemUnprocessed(unpr.getUnprocessedItems());
						}
						itemSet.clear();
					} 
					itemSet.add(item);
					i++;
				}
						
				// final write for any remaining words if 25 threshold wasn't reached earlier
				if (!itemSet.isEmpty()) {
					TableWriteItems twi = new TableWriteItems("news");
					twi.withItemsToPut(itemSet);
					BatchWriteItemOutcome unpr = db.batchWriteItem(twi);
					while (unpr.getUnprocessedItems().size() != 0) {
						unpr = db.batchWriteItemUnprocessed(unpr.getUnprocessedItems());
					}
				}

				
			} catch (Exception e) {
				e.printStackTrace();
			}
		} finally {
			if (reader != null)
				reader.close();
			
			// if (fil != null)
			// 	fil.close();
		}

	}
	
	/**
	 * Main functionality in the program: read and process the social network
	 * 
	 * @throws IOException File read, network, and other errors
	 * @throws DynamoDbException DynamoDB is unhappy with something
	 * @throws InterruptedException User presses Ctrl-C
	 */
	public void run() throws IOException, DynamoDbException, InterruptedException {
		logger.info("Running");

		this.getArticles(Config.NEWS_FILE);

	}

	/**
	 * Graceful shutdown
	 */
	public void shutdown() {
		logger.info("Shutting down");
		
		DynamoConnector.shutdown();
		
		if (spark != null)
			spark.close();
	}
	
	public static void main(String[] args) {
		final LoadNews ln = new LoadNews();

		try {
			ln.initialize();

			ln.run();
		} catch (final IOException ie) {
			logger.error("I/O error: ");
			ie.printStackTrace();
		} catch (final DynamoDbException e) {
			e.printStackTrace();
		} catch (final InterruptedException e) {
			e.printStackTrace();
		} finally {
			ln.shutdown();
		}
	}

}
